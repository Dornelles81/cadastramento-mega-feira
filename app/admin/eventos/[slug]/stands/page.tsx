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
}

interface Event {
  id: string;
  name: string;
  slug: string;
  code: string;
}

export default function EventStandsPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = use(params);
  const slug = resolvedParams.slug;
  const router = useRouter();

  const [event, setEvent] = useState<Event | null>(null);
  const [stands, setStands] = useState<Stand[]>([]);
  const [stats, setStats] = useState<StandStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingStand, setEditingStand] = useState<Stand | null>(null);
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
      const password = localStorage.getItem('adminPassword') || 'admin123';

      const response = await fetch(`/api/admin/eventos/${slug}/stands`, {
        headers: {
          'Authorization': `Bearer ${password}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        // Event info now comes from stands API
        if (data.event) {
          setEvent(data.event);
        }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const password = localStorage.getItem('adminPassword') || 'admin123';
    const url = editingStand
      ? `/api/admin/eventos/${slug}/stands?id=${editingStand.id}`
      : `/api/admin/eventos/${slug}/stands`;

    const method = editingStand ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${password}`
        },
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
    const password = localStorage.getItem('adminPassword') || 'admin123';

    try {
      const response = await fetch(`/api/admin/eventos/${slug}/stands?id=${stand.id}`, {
        headers: {
          'Authorization': `Bearer ${password}`
        }
      });

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

    const password = localStorage.getItem('adminPassword') || 'admin123';

    try {
      const response = await fetch(`/api/admin/eventos/${slug}/stands?id=${standId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${password}`
        }
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

  const getUsageColor = (percentage?: number) => {
    if (!percentage) return 'bg-gray-200';
    if (percentage >= 100) return 'bg-red-500';
    if (percentage >= 80) return 'bg-yellow-500';
    if (percentage >= 50) return 'bg-blue-500';
    return 'bg-green-500';
  };

  // File input ref for import
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Download Excel template
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

    // Set column widths
    ws['!cols'] = [
      { wch: 15 }, // Código
      { wch: 25 }, // Nome
      { wch: 20 }, // Limite
      { wch: 30 }, // Descrição
      { wch: 25 }, // Localização
      { wch: 25 }, // Nome Responsável
      { wch: 30 }, // Email
      { wch: 20 }, // Telefone
      { wch: 12 }, // Ativo
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stands');

    // Add instructions sheet
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

  // Import stands from Excel
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

      // Validate and transform data
      const standsToImport: any[] = [];
      const errors: string[] = [];

      jsonData.forEach((row: any, index: number) => {
        const rowNum = index + 2; // +2 because of header and 0-index

        const code = row['Código*']?.toString().toUpperCase().trim();
        const name = row['Nome*']?.toString().trim();
        const maxRegistrations = parseInt(row['Limite de Registros*']);

        if (!code) {
          errors.push(`Linha ${rowNum}: Código é obrigatório`);
          return;
        }
        if (!name) {
          errors.push(`Linha ${rowNum}: Nome é obrigatório`);
          return;
        }
        if (!maxRegistrations || maxRegistrations < 1) {
          errors.push(`Linha ${rowNum}: Limite de Registros deve ser maior que 0`);
          return;
        }

        standsToImport.push({
          code,
          name,
          maxRegistrations,
          description: row['Descrição']?.toString().trim() || '',
          location: row['Localização']?.toString().trim() || '',
          responsibleName: row['Nome do Responsável']?.toString().trim() || '',
          responsibleEmail: row['Email do Responsável']?.toString().trim() || '',
          responsiblePhone: row['Telefone do Responsável']?.toString().trim() || '',
          isActive: row['Ativo (S/N)']?.toString().toUpperCase() !== 'N'
        });
      });

      if (errors.length > 0) {
        alert(`Erros encontrados:\n\n${errors.join('\n')}`);
        return;
      }

      if (standsToImport.length === 0) {
        alert('Nenhum stand válido para importar');
        return;
      }

      // Confirm import
      if (!confirm(`Importar ${standsToImport.length} stands?\n\nStands existentes com mesmo código serão atualizados.`)) {
        return;
      }

      // Send to API
      const password = localStorage.getItem('adminPassword') || 'admin123';
      const response = await fetch(`/api/admin/eventos/${slug}/stands/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${password}`
        },
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

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Export current stands to Excel
  const exportStands = () => {
    if (stands.length === 0) {
      alert('Nenhum stand para exportar');
      return;
    }

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
              <p className="text-gray-600 mt-1">Configure limites de registros por stand para este evento</p>
            </div>
            <Link
              href={`/admin/eventos/${slug}`}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Voltar
            </Link>
          </div>

          {/* Statistics */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-600 font-medium">Total de Stands</p>
                <p className="text-3xl font-bold text-blue-900">{stats.total}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-green-600 font-medium">Stands Ativos</p>
                <p className="text-3xl font-bold text-green-900">{stats.active}</p>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <p className="text-sm text-red-600 font-medium">Stands Cheios</p>
                <p className="text-3xl font-bold text-red-900">{stats.full}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <p className="text-sm text-purple-600 font-medium">Total de Registros</p>
                <p className="text-3xl font-bold text-purple-900">
                  {stands.reduce((sum, s) => sum + (s.currentCount || 0), 0)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mb-6 flex flex-wrap gap-3">
          <button
            onClick={() => {
              resetForm();
              setEditingStand(null);
              setShowForm(!showForm);
            }}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            {showForm ? 'Cancelar' : '+ Novo Stand'}
          </button>

          <button
            onClick={downloadTemplate}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
          >
            📥 Baixar Template Excel
          </button>

          <label className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium cursor-pointer">
            📤 Importar Excel
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImport}
              className="hidden"
            />
          </label>

          {stands.length > 0 && (
            <button
              onClick={exportStands}
              className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium"
            >
              📊 Exportar Stands
            </button>
          )}
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">
              {editingStand ? 'Editar Stand' : 'Novo Stand'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nome do Stand *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    placeholder="Ex: Samsung, Apple, Stand 1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Codigo do Stand *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    placeholder="Ex: SAMSUNG, STAND001"
                    disabled={!!editingStand}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Limite de Registros *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formData.maxRegistrations}
                    onChange={(e) => setFormData({...formData, maxRegistrations: parseInt(e.target.value)})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Localizacao
                  </label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({...formData, location: e.target.value})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    placeholder="Ex: Pavilhao A - Setor 3"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descricao
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    rows={2}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nome do Responsavel
                  </label>
                  <input
                    type="text"
                    value={formData.responsibleName}
                    onChange={(e) => setFormData({...formData, responsibleName: e.target.value})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email do Responsavel
                  </label>
                  <input
                    type="email"
                    value={formData.responsibleEmail}
                    onChange={(e) => setFormData({...formData, responsibleEmail: e.target.value})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Telefone do Responsavel
                  </label>
                  <input
                    type="tel"
                    value={formData.responsiblePhone}
                    onChange={(e) => setFormData({...formData, responsiblePhone: e.target.value})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                    className="h-4 w-4 text-blue-600"
                  />
                  <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">
                    Stand Ativo
                  </label>
                </div>
              </div>

              {/* Participants Section - Only show when editing and has participants */}
              {editingStand && editingStand.participants && editingStand.participants.length > 0 && (
                <div className="mt-6 border-t pt-6">
                  <h3 className="text-lg font-bold mb-4">
                    Participantes Vinculados ({editingStand.participants.length})
                  </h3>
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
                        {editingStand.participants.map((participant) => (
                          <tr key={participant.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900">{participant.name}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{participant.cpf}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{participant.email || '-'}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                participant.approvalStatus === 'approved' ? 'bg-green-100 text-green-800' :
                                participant.approvalStatus === 'rejected' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {participant.approvalStatus === 'approved' ? 'Aprovado' :
                                 participant.approvalStatus === 'rejected' ? 'Rejeitado' :
                                 'Pendente'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  {editingStand ? 'Atualizar' : 'Criar'} Stand
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingStand(null);
                    resetForm();
                  }}
                  className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                >
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
              <div className="text-center py-8">
                <p className="text-gray-500">Carregando...</p>
              </div>
            ) : stands.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">Nenhum stand cadastrado para este evento</p>
                <p className="text-sm text-gray-400 mt-2">Clique em "+ Novo Stand" para criar o primeiro</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Nome</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Codigo</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Uso</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Progresso</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Responsavel</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Acoes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {stands.map((stand) => (
                      <tr key={stand.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900">{stand.name}</p>
                            {stand.location && (
                              <p className="text-xs text-gray-500">{stand.location}</p>
                            )}
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
                              <div
                                className={`h-2 rounded-full ${getUsageColor(stand.usagePercentage)}`}
                                style={{ width: `${Math.min(stand.usagePercentage || 0, 100)}%` }}
                              />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {Math.round(stand.usagePercentage || 0)}%
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            stand.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {stand.isActive ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {stand.responsibleName ? (
                            <div className="text-sm">
                              <p className="text-gray-900">{stand.responsibleName}</p>
                              {stand.responsibleEmail && (
                                <p className="text-xs text-gray-500">{stand.responsibleEmail}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-sm">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleEdit(stand)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium mr-3"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDelete(stand.id)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                          >
                            Deletar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
