'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface EventAccess {
  id: string
  eventId: string
  event: {
    id: string
    name: string
    code: string
    slug: string
  }
  canView: boolean
  canEdit: boolean
  canApprove: boolean
  canDelete: boolean
  canExport: boolean
  canManageStands: boolean
  isActive: boolean
}

interface Admin {
  id: string
  email: string
  name: string
  role: string
  isActive: boolean
  createdAt: string
  events: EventAccess[]
}

interface Event {
  id: string
  name: string
  code: string
  slug: string
}

export default function ManageAdminsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [admins, setAdmins] = useState<Admin[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingAdmin, setEditingAdmin] = useState<Admin | null>(null)
  const [showPermissionsModal, setShowPermissionsModal] = useState(false)

  // New admin form
  const [newAdmin, setNewAdmin] = useState({
    email: '',
    password: '',
    name: '',
    role: 'ADMIN' as 'ADMIN' | 'SUPER_ADMIN'
  })

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/admin/login')
    }

    if (status === 'authenticated') {
      // Check if super admin
      if (session?.user?.role !== 'SUPER_ADMIN') {
        router.push('/admin/dashboard')
        return
      }

      loadAdmins()
      loadEvents()
    }
  }, [status, session])

  const loadAdmins = async () => {
    try {
      const response = await fetch('/api/admin/event-admins')
      if (response.ok) {
        const data = await response.json()
        setAdmins(data.admins)
      }
    } catch (error) {
      console.error('Error loading admins:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadEvents = async () => {
    try {
      const response = await fetch('/api/admin/eventos')
      if (response.ok) {
        const data = await response.json()
        setEvents(data.events)
      }
    } catch (error) {
      console.error('Error loading events:', error)
    }
  }

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!newAdmin.email || !newAdmin.password || !newAdmin.name) {
      alert('Por favor, preencha todos os campos')
      return
    }

    try {
      const response = await fetch('/api/admin/event-admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAdmin)
      })

      if (response.ok) {
        alert('Admin criado com sucesso!')
        setShowCreateModal(false)
        setNewAdmin({ email: '', password: '', name: '', role: 'ADMIN' })
        loadAdmins()
      } else {
        const error = await response.json()
        alert(`Erro: ${error.message || 'Falha ao criar admin'}`)
      }
    } catch (error) {
      console.error('Error creating admin:', error)
      alert('Erro ao criar admin')
    }
  }

  const handleToggleActive = async (adminId: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/admin/event-admins/${adminId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus })
      })

      if (response.ok) {
        alert(`Admin ${!currentStatus ? 'ativado' : 'desativado'} com sucesso!`)
        loadAdmins()
      }
    } catch (error) {
      console.error('Error toggling admin status:', error)
      alert('Erro ao alterar status do admin')
    }
  }

  const handleUpdatePermissions = async (accessId: string, permissions: any) => {
    try {
      const response = await fetch(`/api/admin/event-admins/access/${accessId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(permissions)
      })

      if (response.ok) {
        alert('Permissões atualizadas com sucesso!')
        loadAdmins()
      }
    } catch (error) {
      console.error('Error updating permissions:', error)
      alert('Erro ao atualizar permissões')
    }
  }

  const handleAssignEvent = async (adminId: string, eventId: string) => {
    try {
      const response = await fetch('/api/admin/event-admins/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId,
          eventId,
          canView: true,
          canEdit: true,
          canApprove: true,
          canDelete: false,
          canExport: true,
          canManageStands: true
        })
      })

      if (response.ok) {
        alert('Evento atribuído com sucesso!')
        loadAdmins()
      } else {
        const error = await response.json()
        alert(`Erro: ${error.message || 'Falha ao atribuir evento'}`)
      }
    } catch (error) {
      console.error('Error assigning event:', error)
      alert('Erro ao atribuir evento')
    }
  }

  const handleUnassignEvent = async (accessId: string) => {
    if (!confirm('Deseja remover o acesso deste admin ao evento?')) return

    try {
      const response = await fetch(`/api/admin/event-admins/access/${accessId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        alert('Acesso removido com sucesso!')
        loadAdmins()
      }
    } catch (error) {
      console.error('Error unassigning event:', error)
      alert('Erro ao remover acesso')
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-fundo-claro flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">⏳</div>
          <p className="text-cinza">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!session || session.user.role !== 'SUPER_ADMIN') {
    return null
  }

  return (
    <div className="min-h-screen bg-fundo-claro">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-cinza-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-azul-marinho">
                👥 Gerenciar Administradores
              </h1>
              <p className="text-sm text-cinza">
                Criar e configurar administradores de eventos
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-verde-agua text-white rounded-lg hover:bg-verde-agua-dark transition-colors"
              >
                ➕ Novo Admin
              </button>
              <button
                onClick={() => router.push('/admin/dashboard')}
                className="px-4 py-2 bg-cinza-500 text-white rounded-lg hover:bg-cinza-600 transition-colors"
              >
                ← Voltar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {admins.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center border border-cinza-200">
            <div className="text-6xl mb-4">📭</div>
            <h3 className="text-xl font-semibold text-azul-marinho mb-2">
              Nenhum administrador cadastrado
            </h3>
            <p className="text-cinza mb-6">
              Crie o primeiro administrador para gerenciar eventos
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-verde-agua text-white rounded-lg hover:bg-verde-agua-dark transition-colors"
            >
              ➕ Criar Primeiro Admin
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {admins.map((admin) => (
              <div
                key={admin.id}
                className="bg-white rounded-lg shadow-sm p-6 border border-cinza-200"
              >
                {/* Admin Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold text-azul-marinho">
                        {admin.name}
                      </h3>
                      {admin.role === 'SUPER_ADMIN' && (
                        <span className="px-2 py-0.5 bg-verde-agua/20 text-verde-agua-dark text-xs rounded-full font-semibold">
                          👑 SUPER ADMIN
                        </span>
                      )}
                      <span className={`px-2 py-0.5 text-xs rounded-full font-semibold ${
                        admin.isActive
                          ? 'bg-verde/10 text-verde'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {admin.isActive ? '✅ Ativo' : '❌ Inativo'}
                      </span>
                    </div>
                    <p className="text-sm text-cinza">
                      📧 {admin.email}
                    </p>
                    <p className="text-xs text-cinza-light mt-1">
                      Criado em: {new Date(admin.createdAt).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleToggleActive(admin.id, admin.isActive)}
                      className={`px-3 py-1 text-sm rounded ${
                        admin.isActive
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : 'bg-verde/10 text-verde hover:bg-verde/20'
                      }`}
                    >
                      {admin.isActive ? '🔒 Desativar' : '🔓 Ativar'}
                    </button>
                  </div>
                </div>

                {/* Admin Events */}
                {admin.role !== 'SUPER_ADMIN' && (
                  <div className="border-t border-cinza-200 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-azul-marinho">
                        📅 Eventos Atribuídos ({admin.events.length})
                      </h4>
                      <button
                        onClick={() => {
                          setEditingAdmin(admin)
                          setShowPermissionsModal(true)
                        }}
                        className="px-3 py-1 bg-azul-medio/10 text-azul-medio rounded text-sm hover:bg-azul-medio/20"
                      >
                        ➕ Atribuir Evento
                      </button>
                    </div>

                    {admin.events.length === 0 ? (
                      <p className="text-sm text-cinza italic">
                        Nenhum evento atribuído
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {admin.events.map((access) => (
                          <div
                            key={access.id}
                            className="bg-fundo-claro rounded-lg p-4 border border-cinza-200"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <p className="font-semibold text-azul-marinho">
                                  {access.event.name}
                                </p>
                                <p className="text-xs text-cinza font-mono">
                                  {access.event.code}
                                </p>
                              </div>
                              <button
                                onClick={() => handleUnassignEvent(access.id)}
                                className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200"
                              >
                                🗑️ Remover
                              </button>
                            </div>

                            {/* Permissions */}
                            <div className="flex flex-wrap gap-1 mb-2">
                              {access.canView && (
                                <span className="px-2 py-0.5 bg-azul-medio/10 text-azul-medio text-xs rounded">
                                  👁️ Ver
                                </span>
                              )}
                              {access.canEdit && (
                                <span className="px-2 py-0.5 bg-verde/10 text-verde text-xs rounded">
                                  ✏️ Editar
                                </span>
                              )}
                              {access.canApprove && (
                                <span className="px-2 py-0.5 bg-verde-agua/10 text-verde-agua-dark text-xs rounded">
                                  ✅ Aprovar
                                </span>
                              )}
                              {access.canDelete && (
                                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded">
                                  🗑️ Deletar
                                </span>
                              )}
                              {access.canExport && (
                                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">
                                  📊 Exportar
                                </span>
                              )}
                              {access.canManageStands && (
                                <span className="px-2 py-0.5 bg-azul-marinho/10 text-azul-marinho text-xs rounded">
                                  🏪 Stands
                                </span>
                              )}
                            </div>

                            {/* Quick Permission Toggles */}
                            <div className="grid grid-cols-3 gap-2 mt-2">
                              <button
                                onClick={() => handleUpdatePermissions(access.id, {
                                  ...access,
                                  canView: !access.canView
                                })}
                                className={`px-2 py-1 text-xs rounded ${
                                  access.canView
                                    ? 'bg-azul-medio text-white'
                                    : 'bg-cinza-200 text-cinza-600'
                                }`}
                              >
                                Ver
                              </button>
                              <button
                                onClick={() => handleUpdatePermissions(access.id, {
                                  ...access,
                                  canEdit: !access.canEdit
                                })}
                                className={`px-2 py-1 text-xs rounded ${
                                  access.canEdit
                                    ? 'bg-verde text-white'
                                    : 'bg-cinza-200 text-cinza-600'
                                }`}
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => handleUpdatePermissions(access.id, {
                                  ...access,
                                  canApprove: !access.canApprove
                                })}
                                className={`px-2 py-1 text-xs rounded ${
                                  access.canApprove
                                    ? 'bg-verde-agua text-white'
                                    : 'bg-cinza-200 text-cinza-600'
                                }`}
                              >
                                Aprovar
                              </button>
                              <button
                                onClick={() => handleUpdatePermissions(access.id, {
                                  ...access,
                                  canDelete: !access.canDelete
                                })}
                                className={`px-2 py-1 text-xs rounded ${
                                  access.canDelete
                                    ? 'bg-red-500 text-white'
                                    : 'bg-cinza-200 text-cinza-600'
                                }`}
                              >
                                Deletar
                              </button>
                              <button
                                onClick={() => handleUpdatePermissions(access.id, {
                                  ...access,
                                  canExport: !access.canExport
                                })}
                                className={`px-2 py-1 text-xs rounded ${
                                  access.canExport
                                    ? 'bg-orange-500 text-white'
                                    : 'bg-cinza-200 text-cinza-600'
                                }`}
                              >
                                Exportar
                              </button>
                              <button
                                onClick={() => handleUpdatePermissions(access.id, {
                                  ...access,
                                  canManageStands: !access.canManageStands
                                })}
                                className={`px-2 py-1 text-xs rounded ${
                                  access.canManageStands
                                    ? 'bg-azul-marinho text-white'
                                    : 'bg-cinza-200 text-cinza-600'
                                }`}
                              >
                                Stands
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Admin Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-azul-marinho mb-4">
              ➕ Criar Novo Administrador
            </h3>

            <form onSubmit={handleCreateAdmin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-azul-marinho mb-2">
                  Nome Completo
                </label>
                <input
                  type="text"
                  value={newAdmin.name}
                  onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })}
                  className="w-full px-3 py-2 border border-cinza-300 rounded-lg text-cinza-900 focus:ring-2 focus:ring-verde-agua focus:border-verde-agua"
                  placeholder="João Silva"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-azul-marinho mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={newAdmin.email}
                  onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                  className="w-full px-3 py-2 border border-cinza-300 rounded-lg text-cinza-900 focus:ring-2 focus:ring-verde-agua focus:border-verde-agua"
                  placeholder="admin@exemplo.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-azul-marinho mb-2">
                  Senha
                </label>
                <input
                  type="password"
                  value={newAdmin.password}
                  onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                  className="w-full px-3 py-2 border border-cinza-300 rounded-lg text-cinza-900 focus:ring-2 focus:ring-verde-agua focus:border-verde-agua"
                  placeholder="Mínimo 8 caracteres"
                  required
                  minLength={8}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-azul-marinho mb-2">
                  Tipo de Administrador
                </label>
                <select
                  value={newAdmin.role}
                  onChange={(e) => setNewAdmin({ ...newAdmin, role: e.target.value as 'ADMIN' | 'SUPER_ADMIN' })}
                  className="w-full px-3 py-2 border border-cinza-300 rounded-lg text-cinza-900 focus:ring-2 focus:ring-verde-agua focus:border-verde-agua bg-white"
                >
                  <option value="ADMIN">Event Admin (acesso por evento)</option>
                  <option value="SUPER_ADMIN">Super Admin (acesso total)</option>
                </select>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-verde-agua text-white rounded-lg font-semibold hover:bg-verde-agua-dark"
                >
                  ✅ Criar Admin
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false)
                    setNewAdmin({ email: '', password: '', name: '', role: 'ADMIN' })
                  }}
                  className="flex-1 py-2 bg-cinza-200 text-cinza-800 rounded-lg font-semibold hover:bg-cinza-300"
                >
                  ❌ Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Event Modal */}
      {showPermissionsModal && editingAdmin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-azul-marinho mb-4">
              📅 Atribuir Evento para {editingAdmin.name}
            </h3>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {events
                .filter(event => !editingAdmin.events.some(e => e.eventId === event.id))
                .map((event) => (
                  <button
                    key={event.id}
                    onClick={() => {
                      handleAssignEvent(editingAdmin.id, event.id)
                      setShowPermissionsModal(false)
                      setEditingAdmin(null)
                    }}
                    className="w-full p-3 bg-fundo-claro hover:bg-verde-agua/10 border border-cinza-200 hover:border-verde-agua rounded-lg text-left transition-colors"
                  >
                    <p className="font-semibold text-azul-marinho">{event.name}</p>
                    <p className="text-xs text-cinza font-mono">{event.code}</p>
                  </button>
                ))}

              {events.filter(event => !editingAdmin.events.some(e => e.eventId === event.id)).length === 0 && (
                <p className="text-sm text-cinza text-center py-8">
                  Todos os eventos já foram atribuídos a este admin
                </p>
              )}
            </div>

            <button
              onClick={() => {
                setShowPermissionsModal(false)
                setEditingAdmin(null)
              }}
              className="w-full mt-4 py-2 bg-cinza-200 text-cinza-800 rounded-lg font-semibold hover:bg-cinza-300"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
