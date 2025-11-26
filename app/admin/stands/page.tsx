'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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

export default function StandsManagementPage() {
  const router = useRouter();
  const [stands, setStands] = useState<Stand[]>([]);
  const [stats, setStats] = useState<StandStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingStand, setEditingStand] = useState<Stand | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    maxRegistrations: 3,
    eventCode: 'MEGA-FEIRA-2025',
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    location: '',
    isActive: true
  });

  useEffect(() => {
    loadStands();
  }, []);

  const loadStands = async () => {
    try {
      setLoading(true);
      const password = localStorage.getItem('adminPassword') || 'admin123';

      const response = await fetch('/api/admin/stands', {
        headers: {
          'Authorization': `Bearer ${password}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
        setStands(data.stands || []);
      } else {
        alert('Erro ao carregar stands');
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
      ? `/api/admin/stands?id=${editingStand.id}`
      : '/api/admin/stands';

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
      // Buscar detalhes completos do stand incluindo participantes
      const response = await fetch(`/api/admin/stands?id=${stand.id}`, {
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
          eventCode: detailedStand.eventCode || 'MEGA-FEIRA-2025',
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
      const response = await fetch(`/api/admin/stands?id=${standId}`, {
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

  const handleRemoveParticipant = async (participantId: string) => {
    if (!confirm('Tem certeza que deseja remover este participante do stand?')) return;

    const password = localStorage.getItem('adminPassword') || 'admin123';

    try {
      const response = await fetch(`/api/admin/participants/${participantId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${password}`
        },
        body: JSON.stringify({ standId: null })
      });

      if (response.ok) {
        alert('Participante removido do stand!');
        // Recarregar detalhes do stand
        if (editingStand) {
          handleEdit(editingStand);
        }
        loadStands();
      } else {
        const error = await response.json();
        alert(error.error || 'Erro ao remover participante');
      }
    } catch (error) {
      console.error('Error removing participant:', error);
      alert('Erro ao remover participante');
    }
  };

  const handleEditParticipant = (participantId: string) => {
    // Redirecionar para a página de admin com o participante selecionado
    router.push(`/admin?participantId=${participantId}`);
  };

  const handleImportExcel = async () => {
    if (!importFile) {
      alert('Por favor, selecione um arquivo Excel');
      return;
    }

    try {
      setImporting(true);
      const formData = new FormData();
      formData.append('file', importFile);

      const token = sessionStorage.getItem('adminFieldsAuth') || localStorage.getItem('adminPassword') || 'admin123';

      const response = await fetch('/api/admin/import-stands', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        alert(`✅ ${result.message}\n\nCriados: ${result.results.created}\nAtualizados: ${result.results.updated}\nErros: ${result.results.errors.length}`);

        if (result.results.errors.length > 0) {
          console.log('Erros na importação:', result.results.errors);
        }

        setShowImportModal(false);
        setImportFile(null);
        loadStands();
      } else {
        const error = await response.json();
        alert(`Erro na importação: ${error.error || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Import error:', error);
      alert('Erro ao importar arquivo Excel');
    } finally {
      setImporting(false);
    }
  };

  const downloadExcelTemplate = () => {
    // Download the Excel template file from public folder
    const link = document.createElement('a');
    link.href = '/modelo-importacao-stands.xlsx';
    link.download = 'modelo-importacao-stands.xlsx';
    link.click();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      description: '',
      maxRegistrations: 3,
      eventCode: 'MEGA-FEIRA-2025',
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

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Gerenciar Stands</h1>
              <p className="text-gray-600 mt-1">Configure limites de registros faciais por stand</p>
            </div>
            <button
              onClick={() => router.push('/admin')}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              ← Voltar
            </button>
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
        <div className="mb-6 flex gap-3">
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
            onClick={() => setShowImportModal(true)}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center gap-2"
          >
            📊 Importar Excel
          </button>
        </div>

        {/* Import Modal */}
        {showImportModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
              <h3 className="text-xl font-bold mb-4">Importar Stands via Excel</h3>

              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800 mb-2">
                    📋 <strong>Instruções:</strong>
                  </p>
                  <ul className="text-sm text-blue-700 list-disc list-inside space-y-1">
                    <li>Baixe o modelo Excel clicando no botão abaixo</li>
                    <li>Preencha com seus dados</li>
                    <li>Faça o upload do arquivo preenchido</li>
                  </ul>
                </div>

                <button
                  onClick={downloadExcelTemplate}
                  className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  ⬇️ Baixar Modelo Excel
                </button>

                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="w-full"
                  />
                  {importFile && (
                    <p className="text-sm text-green-600 mt-2">
                      ✅ Arquivo selecionado: {importFile.name}
                    </p>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowImportModal(false);
                      setImportFile(null);
                    }}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                    disabled={importing}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleImportExcel}
                    disabled={!importFile || importing}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {importing ? 'Importando...' : 'Importar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Ex: Samsung, Apple, Stand 1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Código do Stand *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
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
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Código do Evento
                  </label>
                  <input
                    type="text"
                    value={formData.eventCode}
                    onChange={(e) => setFormData({...formData, eventCode: e.target.value})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descrição
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={2}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nome do Responsável
                  </label>
                  <input
                    type="text"
                    value={formData.responsibleName}
                    onChange={(e) => setFormData({...formData, responsibleName: e.target.value})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email do Responsável
                  </label>
                  <input
                    type="email"
                    value={formData.responsibleEmail}
                    onChange={(e) => setFormData({...formData, responsibleEmail: e.target.value})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Telefone do Responsável
                  </label>
                  <input
                    type="tel"
                    value={formData.responsiblePhone}
                    onChange={(e) => setFormData({...formData, responsiblePhone: e.target.value})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Localização
                  </label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({...formData, location: e.target.value})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Ex: Pavilhão A - Setor 3"
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
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Telefone</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Status</th>
                          <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {editingStand.participants.map((participant) => (
                          <tr key={participant.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900">{participant.name}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{participant.cpf}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{participant.email || '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{participant.phone || '-'}</td>
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
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => handleEditParticipant(participant.id)}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium mr-3"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => handleRemoveParticipant(participant.id)}
                                className="text-red-600 hover:text-red-800 text-sm font-medium"
                              >
                                Remover
                              </button>
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
                <p className="text-gray-500">Nenhum stand cadastrado</p>
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
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Responsável</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Ações</th>
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
