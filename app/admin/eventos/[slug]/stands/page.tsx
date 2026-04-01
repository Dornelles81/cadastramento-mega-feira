'use client';

import { useState, useEffect, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';

interface Participant {
  id: string;
  name: string;
  cpf: string;
  email?: string;
  phone?: string;
  createdAt: string;
  approvalStatus?: string;
}

interface Stand {
  id: string;
  name: string;
  code: string;
  description?: string;
  maxRegistrations: number;
  currentCount?: number;
  availableSlots?: number;
  usagePercentage?: number;
  isFull?: boolean;
  eventId?: string;
  eventCode?: string;
  responsibleName?: string;
  responsibleEmail?: string;
  responsiblePhone?: string;
  location?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  participants?: Participant[];
  _count?: {
    participants: number;
  };
}

interface StandStats {
  stands: Stand[];
  total: number;
  active: number;
  full: number;
  withoutRegistrations: number;
}

interface Event {
  id: string;
  name: string;
  slug: string;
  code: string;
}

type OccupancyFilter = 'all' | 'empty' | 'partial' | 'full';

function getOccupancyStatus(stand: Stand): { label: string; color: string; bg: string } {
  const count = stand.currentCount ?? 0;
  const pct = stand.usagePercentage ?? 0;
  if (count === 0) return { label: 'Sem cadastro', color: 'text-gray-700', bg: 'bg-gray-100' };
  if (pct >= 100) return { label: 'Completo', color: 'text-red-700', bg: 'bg-red-100' };
  if (pct >= 50) return { label: 'Em andamento', color: 'text-blue-700', bg: 'bg-blue-100' };
  return { label: 'Iniciado', color: 'text-yellow-700', bg: 'bg-yellow-100' };
}

function getApprovalLabel(status?: string) {
  if (status === 'approved') return { label: 'Aprovado', cls: 'bg-green-100 text-green-800' };
  if (status === 'rejected') return { label: 'Rejeitado', cls: 'bg-red-100 text-red-800' };
  return { label: 'Pendente', cls: 'bg-yellow-100 text-yellow-800' };
}

export default function EventStandsPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = use(params);
  const slug = resolvedParams.slug;
  const router = useRouter();

  const formRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [event, setEvent] = useState<Event | null>(null);
  const [stands, setStands] = useState<Stand[]>([]);
  const [stats, setStats] = useState<StandStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingStand, setEditingStand] = useState<Stand | null>(null);

  // Relatório de ocupação
  const [reportMode, setReportMode] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportStands, setReportStands] = useState<Stand[]>([]);
  const [filter, setFilter] = useState<OccupancyFilter>('all');
  const [expandedStandId, setExpandedStandId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    maxRegistrations: 3,
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    location: '',
    isActive: true
  });

  useEffect(() => {
    loadStands();
  }, [slug]);

  const loadStands = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/eventos/${slug}/stands`);
      if (response.ok) {
        const data = await response.json();
        if (data.event) setEvent(data.event);
        setStats(data);
        setStands(data.stands || []);
      } else {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.error === 'Event not found') {
          alert('Evento não encontrado');
          router.push('/admin/dashboard');
        } else {
          alert('Erro ao carregar stands');
        }
      }
    } catch (error) {
      console.error('Error loading stands:', error);
      alert('Erro ao carregar stands');
    } finally {
      setLoading(false);
    }
  };

  const loadOccupancyReport = async () => {
    try {
      setReportLoading(true);
      const response = await fetch(`/api/admin/eventos/${slug}/stands?withParticipants=true`);
      if (response.ok) {
        const data = await response.json();
        setReportStands(data.stands || []);
      } else {
        alert('Erro ao carregar relatório');
      }
    } catch (error) {
      console.error('Error loading report:', error);
      alert('Erro ao carregar relatório');
    } finally {
      setReportLoading(false);
    }
  };

  const handleToggleReport = () => {
    if (!reportMode) {
      setReportMode(true);
      setFilter('all');
      setExpandedStandId(null);
      loadOccupancyReport();
    } else {
      setReportMode(false);
    }
  };

  const filteredReportStands = reportStands.filter(s => {
    const count = s.currentCount ?? 0;
    const pct = s.usagePercentage ?? 0;
    if (filter === 'empty') return count === 0;
    if (filter === 'full') return pct >= 100;
    if (filter === 'partial') return count > 0 && pct < 100;
    return true;
  });

  const getUsageColor = (percentage?: number) => {
    if (!percentage) return 'bg-gray-200';
    if (percentage >= 100) return 'bg-red-500';
    if (percentage >= 80) return 'bg-yellow-500';
    if (percentage >= 50) return 'bg-blue-500';
    return 'bg-green-500';
  };

  const exportOccupancyReport = () => {
    if (reportStands.length === 0) {
      alert('Nenhum dado para exportar. Carregue o relatório primeiro.');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Aba 1: Resumo de stands
    const summaryData = reportStands.map(stand => {
      const occ = getOccupancyStatus(stand);
      return {
        'Stand': stand.name,
        'Código': stand.code,
        'Localização': stand.location || '',
        'Responsável': stand.responsibleName || '',
        'Email Responsável': stand.responsibleEmail || '',
        'Telefone Responsável': stand.responsiblePhone || '',
        'Limite': stand.maxRegistrations,
        'Cadastrados': stand.currentCount ?? 0,
        'Vagas Disponíveis': stand.availableSlots ?? 0,
        'Ocupação (%)': Math.round(stand.usagePercentage ?? 0),
        'Status': occ.label,
        'Stand Ativo': stand.isActive ? 'Sim' : 'Não',
      };
    });

    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    wsSummary['!cols'] = [
      { wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 25 }, { wch: 30 },
      { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 12 }
    ];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Ocupação dos Stands');

    // Aba 2: Participantes por stand
    const participantRows: any[] = [];
    reportStands.forEach(stand => {
      const participants = stand.participants || [];
      if (participants.length === 0) {
        participantRows.push({
          'Stand': stand.name,
          'Código Stand': stand.code,
          'Responsável Stand': stand.responsibleName || '',
          'Nome Participante': '-- SEM CADASTRO --',
          'CPF': '',
          'Email': '',
          'Telefone': '',
          'Status Aprovação': '',
          'Data Cadastro': '',
        });
      } else {
        participants.forEach(p => {
          const approval = getApprovalLabel(p.approvalStatus);
          participantRows.push({
            'Stand': stand.name,
            'Código Stand': stand.code,
            'Responsável Stand': stand.responsibleName || '',
            'Nome Participante': p.name,
            'CPF': p.cpf,
            'Email': p.email || '',
            'Telefone': p.phone || '',
            'Status Aprovação': approval.label,
            'Data Cadastro': new Date(p.createdAt).toLocaleDateString('pt-BR'),
          });
        });
      }
    });

    const wsParticipants = XLSX.utils.json_to_sheet(participantRows);
    wsParticipants['!cols'] = [
      { wch: 25 }, { wch: 15 }, { wch: 25 }, { wch: 30 }, { wch: 15 },
      { wch: 30 }, { wch: 18 }, { wch: 14 }, { wch: 15 }
    ];
    XLSX.utils.book_append_sheet(wb, wsParticipants, 'Participantes por Stand');

    // Aba 3: Stands sem cadastro (para cobrança)
    const emptySummary = reportStands
      .filter(s => (s.currentCount ?? 0) === 0)
      .map(s => ({
        'Stand': s.name,
        'Código': s.code,
        'Localização': s.location || '',
        'Responsável': s.responsibleName || '',
        'Email Responsável': s.responsibleEmail || '',
        'Telefone Responsável': s.responsiblePhone || '',
        'Limite de Vagas': s.maxRegistrations,
        'Observação': 'Nenhum participante cadastrado',
      }));

    if (emptySummary.length > 0) {
      const wsEmpty = XLSX.utils.json_to_sheet(emptySummary);
      wsEmpty['!cols'] = [
        { wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 25 }, { wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 30 }
      ];
      XLSX.utils.book_append_sheet(wb, wsEmpty, 'Stands Sem Cadastro');
    }

    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `relatorio_ocupacao_${event?.slug || 'evento'}_${date}.xlsx`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingStand
      ? `/api/admin/eventos/${slug}/stands?id=${editingStand.id}`
      : `/api/admin/eventos/${slug}/stands`;
    const method = editingStand ? 'PUT' : 'POST';
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (response.ok) {
        alert(editingStand ? 'Stand atualizado!' : 'Stand criado!');
        setShowForm(false);
        setEditingStand(null);
        resetForm();
        loadStands();
      } else {
        const error = await response.json();
        alert(error.error || 'Erro ao salvar stand');
      }
    } catch (error) {
      console.error('Error saving stand:', error);
      alert('Erro ao salvar stand');
    }
  };

  const handleEdit = async (stand: Stand) => {
    try {
      const response = await fetch(`/api/admin/eventos/${slug}/stands?id=${stand.id}`);
      if (response.ok) {
        const detailedStand = await response.json();
        setEditingStand(detailedStand);
        setFormData({
          name: detailedStand.name,
          code: detailedStand.code,
          description: detailedStand.description || '',
          maxRegistrations: detailedStand.maxRegistrations,
          responsibleName: detailedStand.responsibleName || '',
          responsibleEmail: detailedStand.responsibleEmail || '',
          responsiblePhone: detailedStand.responsiblePhone || '',
          location: detailedStand.location || '',
          isActive: detailedStand.isActive
        });
        setShowForm(true);
        setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      } else {
        alert('Erro ao carregar detalhes do stand');
      }
    } catch (error) {
      console.error('Error loading stand details:', error);
      alert('Erro ao carregar detalhes do stand');
    }
  };

  const handleDelete = async (standId: string) => {
    if (!confirm('Tem certeza que deseja deletar este stand?')) return;
    try {
      const response = await fetch(`/api/admin/eventos/${slug}/stands?id=${standId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        alert('Stand deletado!');
        loadStands();
      } else {
        const error = await response.json();
        alert(error.error || 'Erro ao deletar stand');
      }
    } catch (error) {
      console.error('Error deleting stand:', error);
      alert('Erro ao deletar stand');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      description: '',
      maxRegistrations: 3,
      responsibleName: '',
      responsibleEmail: '',
      responsiblePhone: '',
      location: '',
      isActive: true
    });
  };

  const downloadTemplate = () => {
    const templateData = [
      {
        'Código*': 'STAND001',
        'Nome*': 'Stand Exemplo',
        'Limite de Registros*': 5,
        'Descrição': 'Descrição do stand',
        'Localização': 'Pavilhão A - Setor 1',
        'Nome do Responsável': 'João Silva',
        'Email do Responsável': 'joao@email.com',
        'Telefone do Responsável': '(51) 99999-9999',
        'Ativo (S/N)': 'S'
      },
      {
        'Código*': 'STAND002',
        'Nome*': 'Outro Stand',
        'Limite de Registros*': 3,
        'Descrição': '',
        'Localização': 'Pavilhão B',
        'Nome do Responsável': '',
        'Email do Responsável': '',
        'Telefone do Responsável': '',
        'Ativo (S/N)': 'S'
      }
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    ws['!cols'] = [
      { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 30 }, { wch: 25 },
      { wch: 25 }, { wch: 30 }, { wch: 20 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stands');
    const instructions = [
      { 'Instruções de Preenchimento': '' },
      { 'Instruções de Preenchimento': '1. Campos com * são obrigatórios' },
      { 'Instruções de Preenchimento': '2. Código deve ser único e em MAIÚSCULAS (ex: STAND001)' },
      { 'Instruções de Preenchimento': '3. Limite de Registros deve ser um número maior que 0' },
      { 'Instruções de Preenchimento': '4. Ativo: use S para Sim ou N para Não' },
      { 'Instruções de Preenchimento': '5. Não altere os cabeçalhos da primeira linha' },
      { 'Instruções de Preenchimento': '6. Apague as linhas de exemplo antes de importar' },
      { 'Instruções de Preenchimento': '' },
      { 'Instruções de Preenchimento': `Evento: ${event?.name}` },
    ];
    const wsInstructions = XLSX.utils.json_to_sheet(instructions);
    wsInstructions['!cols'] = [{ wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instruções');
    XLSX.writeFile(wb, `template_stands_${event?.slug || 'evento'}.xlsx`);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      if (jsonData.length === 0) {
        alert('Arquivo vazio ou formato inválido');
        return;
      }
      const standsToImport: any[] = [];
      const errors: string[] = [];
      jsonData.forEach((row: any, index: number) => {
        const rowNum = index + 2;
        const code = row['Código*']?.toString().toUpperCase().trim();
        const name = row['Nome*']?.toString().trim();
        const maxRegistrations = parseInt(row['Limite de Registros*']);
        if (!code) { errors.push(`Linha ${rowNum}: Código é obrigatório`); return; }
        if (!name) { errors.push(`Linha ${rowNum}: Nome é obrigatório`); return; }
        if (!maxRegistrations || maxRegistrations < 1) { errors.push(`Linha ${rowNum}: Limite de Registros deve ser maior que 0`); return; }
        standsToImport.push({
          code, name, maxRegistrations,
          description: row['Descrição']?.toString().trim() || '',
          location: row['Localização']?.toString().trim() || '',
          responsibleName: row['Nome do Responsável']?.toString().trim() || '',
          responsibleEmail: row['Email do Responsável']?.toString().trim() || '',
          responsiblePhone: row['Telefone do Responsável']?.toString().trim() || '',
          isActive: row['Ativo (S/N)']?.toString().toUpperCase() !== 'N'
        });
      });
      if (errors.length > 0) { alert(`Erros encontrados:\n\n${errors.join('\n')}`); return; }
      if (standsToImport.length === 0) { alert('Nenhum stand válido para importar'); return; }
      if (!confirm(`Importar ${standsToImport.length} stands?\n\nStands existentes com mesmo código serão atualizados.`)) return;
      const response = await fetch(`/api/admin/eventos/${slug}/stands/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stands: standsToImport })
      });
      if (response.ok) {
        const result = await response.json();
        alert(`✅ Importação concluída!\n\n${result.created} stands criados\n${result.updated} stands atualizados`);
        loadStands();
      } else {
        const error = await response.json();
        alert(`Erro na importação: ${error.error}`);
      }
    } catch (error) {
      console.error('Error importing:', error);
      alert('Erro ao processar arquivo Excel');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const exportStands = () => {
    if (stands.length === 0) { alert('Nenhum stand para exportar'); return; }
    const exportData = stands.map(stand => ({
      'Código': stand.code,
      'Nome': stand.name,
      'Limite de Registros': stand.maxRegistrations,
      'Registros Atuais': stand.currentCount || 0,
      'Vagas Disponíveis': stand.availableSlots || 0,
      'Uso (%)': Math.round(stand.usagePercentage || 0),
      'Descrição': stand.description || '',
      'Localização': stand.location || '',
      'Nome do Responsável': stand.responsibleName || '',
      'Email do Responsável': stand.responsibleEmail || '',
      'Telefone do Responsável': stand.responsiblePhone || '',
      'Ativo': stand.isActive ? 'Sim' : 'Não',
      'Criado em': new Date(stand.createdAt).toLocaleDateString('pt-BR')
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [
      { wch: 15 }, { wch: 25 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
      { wch: 10 }, { wch: 30 }, { wch: 25 }, { wch: 25 }, { wch: 30 },
      { wch: 20 }, { wch: 10 }, { wch: 15 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stands');
    XLSX.writeFile(wb, `stands_${event?.slug || 'evento'}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (!event) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Carregando evento...</p>
      </div>
    );
  }

  const filterCounts = {
    all: reportStands.length,
    empty: reportStands.filter(s => (s.currentCount ?? 0) === 0).length,
    partial: reportStands.filter(s => (s.currentCount ?? 0) > 0 && (s.usagePercentage ?? 0) < 100).length,
    full: reportStands.filter(s => (s.usagePercentage ?? 0) >= 100).length,
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <Link href="/admin/dashboard" className="hover:text-blue-600">Dashboard</Link>
                <span>/</span>
                <Link href={`/admin/eventos/${slug}`} className="hover:text-blue-600">{event.name}</Link>
                <span>/</span>
                <span className="text-gray-900">Stands</span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900">Stands - {event.name}</h1>
              <p className="text-gray-600 mt-1">
                {reportMode ? 'Relatório de ocupação por stand' : 'Configure limites de registros por stand para este evento'}
              </p>
            </div>
            <Link href={`/admin/eventos/${slug}`} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
              Voltar
            </Link>
          </div>

          {/* Statistics */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-600 font-medium">Total de Stands</p>
                <p className="text-3xl font-bold text-blue-900">{stats.total}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-green-600 font-medium">Stands Ativos</p>
                <p className="text-3xl font-bold text-green-900">{stats.active}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <p className="text-sm text-gray-600 font-medium">Sem Cadastro</p>
                <p className="text-3xl font-bold text-gray-700">{stats.withoutRegistrations ?? 0}</p>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <p className="text-sm text-red-600 font-medium">Stands Cheios</p>
                <p className="text-3xl font-bold text-red-900">{stats.full}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <p className="text-sm text-purple-600 font-medium">Total Cadastros</p>
                <p className="text-3xl font-bold text-purple-900">
                  {stands.reduce((sum, s) => sum + (s.currentCount || 0), 0)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mb-6 flex flex-wrap gap-3">
          {!reportMode && (
            <>
              <button
                onClick={() => { resetForm(); setEditingStand(null); setShowForm(!showForm); }}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                {showForm ? 'Cancelar' : '+ Novo Stand'}
              </button>
              <button onClick={downloadTemplate} className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
                📥 Baixar Template Excel
              </button>
              <label className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium cursor-pointer">
                📤 Importar Excel
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
              </label>
              {stands.length > 0 && (
                <button onClick={exportStands} className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium">
                  📊 Exportar Stands
                </button>
              )}
            </>
          )}

          {stands.length > 0 && (
            <button
              onClick={handleToggleReport}
              className={`px-6 py-3 rounded-lg font-medium ${
                reportMode
                  ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {reportMode ? '← Voltar para Gerenciar' : '📋 Relatório de Ocupação'}
            </button>
          )}

          {reportMode && reportStands.length > 0 && (
            <button
              onClick={exportOccupancyReport}
              className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium"
            >
              📥 Exportar Relatório Excel
            </button>
          )}
        </div>

        {/* ===== RELATÓRIO DE OCUPAÇÃO ===== */}
        {reportMode && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-1">Relatório de Ocupação</h2>
              <p className="text-sm text-gray-500 mb-4">
                Clique em um stand para ver os participantes cadastrados. Use os filtros para localizar stands sem inscrição.
              </p>

              {reportLoading ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent mb-3"></div>
                  <p className="text-gray-500">Carregando dados de ocupação...</p>
                </div>
              ) : (
                <>
                  {/* Filter tabs */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {([
                      { key: 'all', label: 'Todos', color: 'bg-gray-100 text-gray-700 hover:bg-gray-200' },
                      { key: 'empty', label: 'Sem cadastro', color: 'bg-gray-100 text-gray-700 hover:bg-gray-200' },
                      { key: 'partial', label: 'Incompletos', color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
                      { key: 'full', label: 'Completos', color: 'bg-red-50 text-red-700 hover:bg-red-100' },
                    ] as { key: OccupancyFilter; label: string; color: string }[]).map(f => (
                      <button
                        key={f.key}
                        onClick={() => setFilter(f.key)}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                          filter === f.key
                            ? 'ring-2 ring-indigo-500 ring-offset-1 ' + f.color
                            : f.color
                        }`}
                      >
                        {f.label}
                        <span className="ml-2 bg-white bg-opacity-70 px-1.5 py-0.5 rounded-full text-xs font-bold">
                          {filterCounts[f.key]}
                        </span>
                      </button>
                    ))}
                  </div>

                  {filteredReportStands.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">Nenhum stand corresponde ao filtro selecionado.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 w-6"></th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Stand</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Ocupação</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Status</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Responsável</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Contato</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {filteredReportStands.map(stand => {
                            const occ = getOccupancyStatus(stand);
                            const isExpanded = expandedStandId === stand.id;
                            const participants = stand.participants || [];
                            return (
                              <>
                                <tr
                                  key={stand.id}
                                  className={`cursor-pointer transition-colors ${isExpanded ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                                  onClick={() => setExpandedStandId(isExpanded ? null : stand.id)}
                                >
                                  <td className="px-4 py-3 text-gray-400 text-sm">
                                    {isExpanded ? '▼' : '▶'}
                                  </td>
                                  <td className="px-4 py-3">
                                    <p className="font-medium text-gray-900">{stand.name}</p>
                                    <p className="text-xs text-gray-500 font-mono">{stand.code}</p>
                                    {stand.location && <p className="text-xs text-gray-400">{stand.location}</p>}
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      <span className={`font-semibold ${(stand.usagePercentage ?? 0) >= 100 ? 'text-red-600' : 'text-gray-800'}`}>
                                        {stand.currentCount ?? 0} / {stand.maxRegistrations}
                                      </span>
                                    </div>
                                    <div className="w-28 mt-1">
                                      <div className="bg-gray-200 rounded-full h-2">
                                        <div
                                          className={`h-2 rounded-full ${getUsageColor(stand.usagePercentage)}`}
                                          style={{ width: `${Math.min(stand.usagePercentage ?? 0, 100)}%` }}
                                        />
                                      </div>
                                      <p className="text-xs text-gray-400 mt-0.5">{Math.round(stand.usagePercentage ?? 0)}%</p>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${occ.bg} ${occ.color}`}>
                                      {occ.label}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-700">
                                    {stand.responsibleName || <span className="text-gray-400 italic">Não informado</span>}
                                  </td>
                                  <td className="px-4 py-3 text-sm">
                                    {stand.responsibleEmail && (
                                      <a href={`mailto:${stand.responsibleEmail}`} className="text-blue-600 hover:underline block text-xs">
                                        {stand.responsibleEmail}
                                      </a>
                                    )}
                                    {stand.responsiblePhone && (
                                      <a href={`tel:${stand.responsiblePhone}`} className="text-gray-600 hover:underline block text-xs">
                                        {stand.responsiblePhone}
                                      </a>
                                    )}
                                    {!stand.responsibleEmail && !stand.responsiblePhone && (
                                      <span className="text-gray-400 text-xs italic">-</span>
                                    )}
                                  </td>
                                </tr>

                                {/* Linha expandida com participantes */}
                                {isExpanded && (
                                  <tr key={`${stand.id}-expanded`} className="bg-indigo-50">
                                    <td colSpan={6} className="px-8 pb-4 pt-0">
                                      {participants.length === 0 ? (
                                        <div className="py-4 text-center text-gray-500 bg-white rounded-lg border border-dashed border-gray-300 mt-2">
                                          <p className="font-medium text-gray-600">Nenhum participante cadastrado neste stand</p>
                                          <p className="text-sm text-gray-400 mt-1">Entre em contato com o responsável para solicitar as inscrições.</p>
                                        </div>
                                      ) : (
                                        <div className="mt-2 bg-white rounded-lg border border-indigo-200 overflow-hidden">
                                          <div className="px-4 py-2 bg-indigo-100 flex items-center justify-between">
                                            <span className="text-sm font-medium text-indigo-800">
                                              {participants.length} participante{participants.length !== 1 ? 's' : ''} cadastrado{participants.length !== 1 ? 's' : ''}
                                            </span>
                                          </div>
                                          <table className="w-full">
                                            <thead className="bg-gray-50">
                                              <tr>
                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Nome</th>
                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">CPF</th>
                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Email</th>
                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Telefone</th>
                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Aprovação</th>
                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Cadastro</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                              {participants.map(p => {
                                                const appr = getApprovalLabel(p.approvalStatus);
                                                return (
                                                  <tr key={p.id} className="hover:bg-gray-50">
                                                    <td className="px-4 py-2 text-sm text-gray-900 font-medium">{p.name}</td>
                                                    <td className="px-4 py-2 text-sm text-gray-600 font-mono">{p.cpf}</td>
                                                    <td className="px-4 py-2 text-sm text-gray-600">{p.email || '-'}</td>
                                                    <td className="px-4 py-2 text-sm text-gray-600">{p.phone || '-'}</td>
                                                    <td className="px-4 py-2">
                                                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${appr.cls}`}>
                                                        {appr.label}
                                                      </span>
                                                    </td>
                                                    <td className="px-4 py-2 text-xs text-gray-400">
                                                      {new Date(p.createdAt).toLocaleDateString('pt-BR')}
                                                    </td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                )}
                              </>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ===== GERENCIAMENTO NORMAL ===== */}
        {!reportMode && (
          <>
            {/* Form */}
            {showForm && (
              <div ref={formRef} className="bg-white rounded-lg shadow p-6 mb-6">
                <h2 className="text-xl font-bold mb-4">{editingStand ? 'Editar Stand' : 'Novo Stand'}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Stand *</label>
                      <input type="text" required value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                        placeholder="Ex: Samsung, Apple, Stand 1" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Código do Stand *</label>
                      <input type="text" required value={formData.code}
                        onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                        placeholder="Ex: SAMSUNG, STAND001" disabled={!!editingStand} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Limite de Registros *</label>
                      <input type="number" required min="1" value={formData.maxRegistrations}
                        onChange={(e) => setFormData({...formData, maxRegistrations: parseInt(e.target.value)})}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Localização</label>
                      <input type="text" value={formData.location}
                        onChange={(e) => setFormData({...formData, location: e.target.value})}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                        placeholder="Ex: Pavilhão A - Setor 3" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                      <textarea value={formData.description}
                        onChange={(e) => setFormData({...formData, description: e.target.value})}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900" rows={2} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Responsável</label>
                      <input type="text" value={formData.responsibleName}
                        onChange={(e) => setFormData({...formData, responsibleName: e.target.value})}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email do Responsável</label>
                      <input type="email" value={formData.responsibleEmail}
                        onChange={(e) => setFormData({...formData, responsibleEmail: e.target.value})}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Telefone do Responsável</label>
                      <input type="tel" value={formData.responsiblePhone}
                        onChange={(e) => setFormData({...formData, responsiblePhone: e.target.value})}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900" />
                    </div>
                    <div className="flex items-center">
                      <input type="checkbox" id="isActive" checked={formData.isActive}
                        onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                        className="h-4 w-4 text-blue-600" />
                      <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">Stand Ativo</label>
                    </div>
                  </div>

                  {editingStand && editingStand.participants && editingStand.participants.length > 0 && (
                    <div className="mt-6 border-t pt-6">
                      <h3 className="text-lg font-bold mb-4">Participantes Vinculados ({editingStand.participants.length})</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Nome</th>
                              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">CPF</th>
                              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Email</th>
                              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {editingStand.participants.map(participant => {
                              const appr = getApprovalLabel(participant.approvalStatus);
                              return (
                                <tr key={participant.id} className="hover:bg-gray-50">
                                  <td className="px-4 py-3 text-sm text-gray-900">{participant.name}</td>
                                  <td className="px-4 py-3 text-sm text-gray-600">{participant.cpf}</td>
                                  <td className="px-4 py-3 text-sm text-gray-600">{participant.email || '-'}</td>
                                  <td className="px-4 py-3">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${appr.cls}`}>{appr.label}</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 pt-4">
                    <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                      {editingStand ? 'Atualizar' : 'Criar'} Stand
                    </button>
                    <button type="button"
                      onClick={() => { setShowForm(false); setEditingStand(null); resetForm(); }}
                      className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium">
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Stands List */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="p-6">
                <h2 className="text-xl font-bold mb-4">Lista de Stands</h2>
                {loading ? (
                  <div className="text-center py-8"><p className="text-gray-500">Carregando...</p></div>
                ) : stands.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">Nenhum stand cadastrado para este evento</p>
                    <p className="text-sm text-gray-400 mt-2">Clique em &quot;+ Novo Stand&quot; para criar o primeiro</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Nome</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Código</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Uso</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Progresso</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Ocupação</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Status</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Responsável</th>
                          <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {stands.map(stand => {
                          const occ = getOccupancyStatus(stand);
                          return (
                            <tr key={stand.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div>
                                  <p className="font-medium text-gray-900">{stand.name}</p>
                                  {stand.location && <p className="text-xs text-gray-500">{stand.location}</p>}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <code className="bg-gray-100 px-2 py-1 rounded text-sm">{stand.code}</code>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`font-medium ${stand.isFull ? 'text-red-600' : 'text-gray-900'}`}>
                                  {stand.currentCount || 0} / {stand.maxRegistrations}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="w-32">
                                  <div className="bg-gray-200 rounded-full h-2">
                                    <div className={`h-2 rounded-full ${getUsageColor(stand.usagePercentage)}`}
                                      style={{ width: `${Math.min(stand.usagePercentage || 0, 100)}%` }} />
                                  </div>
                                  <p className="text-xs text-gray-500 mt-1">{Math.round(stand.usagePercentage || 0)}%</p>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${occ.bg} ${occ.color}`}>
                                  {occ.label}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${stand.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                  {stand.isActive ? 'Ativo' : 'Inativo'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {stand.responsibleName ? (
                                  <div className="text-sm">
                                    <p className="text-gray-900">{stand.responsibleName}</p>
                                    {stand.responsibleEmail && <p className="text-xs text-gray-500">{stand.responsibleEmail}</p>}
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-sm">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button onClick={() => handleEdit(stand)} className="text-blue-600 hover:text-blue-800 text-sm font-medium mr-3">
                                  Editar
                                </button>
                                <button onClick={() => handleDelete(stand.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">
                                  Deletar
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
