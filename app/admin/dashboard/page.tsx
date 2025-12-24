'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface Event {
  id: string
  slug: string
  name: string
  code: string
  permissions: {
    canView: boolean
    canEdit: boolean
    canApprove: boolean
    canDelete: boolean
    canExport: boolean
    canManageStands: boolean
    canManageAdmins: boolean
  }
  _count?: {
    participants: number
  }
}

export default function AdminDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/admin/login')
    }

    if (status === 'authenticated' && session?.user) {
      loadEvents()
    }
  }, [status, session])

  const loadEvents = async () => {
    try {
      // If super admin, fetch all events from API
      if (session?.user?.role === 'SUPER_ADMIN') {
        const response = await fetch('/api/admin/eventos')
        if (response.ok) {
          const data = await response.json()
          setEvents(data.events)
        }
      } else {
        // Regular admin: use events from session
        setEvents(session?.user?.events || [])
      }
    } catch (error) {
      console.error('Error loading events:', error)
    } finally {
      setLoading(false)
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

  if (!session) {
    return null
  }

  const isSuperAdmin = session.user.role === 'SUPER_ADMIN'

  return (
    <div className="min-h-screen bg-fundo-claro">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-cinza-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center font-bold text-2xl">
                <span className="text-verde-agua italic">MEGA</span>
                <span className="text-azul-marinho ml-2">FEIRA</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-azul-marinho">
                  {isSuperAdmin ? '👑 Super Admin Dashboard' : '📊 Dashboard Administrativo'}
                </h1>
                <p className="text-sm text-cinza">
                  Bem-vindo, <strong className="text-azul-marinho">{session.user.name}</strong>
                  {isSuperAdmin && <span className="ml-2 px-2 py-0.5 bg-verde-agua/20 text-verde-agua-dark text-xs rounded-full font-semibold">SUPER ADMIN</span>}
                </p>
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/admin/login' })}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              🚪 Sair
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Super Admin Tools */}
        {isSuperAdmin && (
          <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => router.push('/admin/super/eventos/novo')}
              className="p-6 bg-gradient-to-r from-verde-agua to-verde text-white rounded-lg hover:shadow-lg transition-all text-left"
            >
              <div className="text-3xl mb-2">➕</div>
              <div className="font-semibold text-lg">Criar Novo Evento</div>
              <div className="text-sm opacity-90">Adicionar um novo evento ao sistema</div>
            </button>

            <button
              onClick={() => router.push('/admin/super/admins')}
              className="p-6 bg-gradient-to-r from-azul-medio to-azul-marinho text-white rounded-lg hover:shadow-lg transition-all text-left"
            >
              <div className="text-3xl mb-2">👥</div>
              <div className="font-semibold text-lg">Gerenciar Admins</div>
              <div className="text-sm opacity-90">Criar e configurar administradores</div>
            </button>

            <button
              onClick={() => router.push('/admin/super/logs')}
              className="p-6 bg-gradient-to-r from-verde to-verde-agua text-white rounded-lg hover:shadow-lg transition-all text-left"
            >
              <div className="text-3xl mb-2">📋</div>
              <div className="font-semibold text-lg">Logs Globais</div>
              <div className="text-sm opacity-90">Ver auditoria de todos os eventos</div>
            </button>

            <button
              onClick={() => router.push('/admin/access-control')}
              className="p-6 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:shadow-lg transition-all text-left"
            >
              <div className="text-3xl mb-2">🚪</div>
              <div className="font-semibold text-lg">Controle de Acesso</div>
              <div className="text-sm opacity-90">Entrada e saida de participantes</div>
            </button>

            <button
              onClick={() => router.push('/admin/access-control/reports')}
              className="p-6 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-lg hover:shadow-lg transition-all text-left"
            >
              <div className="text-3xl mb-2">📊</div>
              <div className="font-semibold text-lg">Relatorios de Acesso</div>
              <div className="text-sm opacity-90">Historico de entradas e saidas</div>
            </button>

            <button
              onClick={() => router.push('/admin/approvals')}
              className="p-6 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-lg hover:shadow-lg transition-all text-left"
            >
              <div className="text-3xl mb-2">✅</div>
              <div className="font-semibold text-lg">Aprovacoes</div>
              <div className="text-sm opacity-90">Aprovar ou rejeitar cadastros</div>
            </button>
          </div>
        )}

        {/* Events Grid */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-azul-marinho mb-4">
            {isSuperAdmin ? '🌍 Todos os Eventos' : '📅 Meus Eventos'}
          </h2>

          {events.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center border border-cinza-200">
              <div className="text-6xl mb-4">📭</div>
              <h3 className="text-xl font-semibold text-azul-marinho mb-2">
                Nenhum evento disponível
              </h3>
              <p className="text-cinza mb-6">
                {isSuperAdmin
                  ? 'Crie seu primeiro evento para começar'
                  : 'Você ainda não foi atribuído a nenhum evento'}
              </p>
              {isSuperAdmin && (
                <button
                  onClick={() => router.push('/admin/super/eventos/novo')}
                  className="px-6 py-3 bg-verde-agua text-white rounded-lg hover:bg-verde-agua-dark transition-colors"
                >
                  ➕ Criar Primeiro Evento
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow p-6 border border-cinza-200"
                >
                  {/* Event Header */}
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-azul-marinho mb-1">
                      {event.name}
                    </h3>
                    <p className="text-sm text-cinza font-mono">
                      {event.code}
                    </p>
                  </div>

                  {/* Stats */}
                  <div className="mb-4 pb-4 border-b border-cinza-200">
                    <div className="text-3xl font-bold text-verde-agua mb-1">
                      {event._count?.participants || 0}
                    </div>
                    <div className="text-sm text-cinza">
                      Participantes cadastrados
                    </div>
                  </div>

                  {/* Permissions */}
                  <div className="mb-4">
                    <div className="text-xs text-cinza mb-2">Suas permissões:</div>
                    <div className="flex flex-wrap gap-1">
                      {event.permissions.canView && (
                        <span className="px-2 py-0.5 bg-azul-medio/10 text-azul-medio text-xs rounded">
                          👁️ Ver
                        </span>
                      )}
                      {event.permissions.canEdit && (
                        <span className="px-2 py-0.5 bg-verde/10 text-verde text-xs rounded">
                          ✏️ Editar
                        </span>
                      )}
                      {event.permissions.canApprove && (
                        <span className="px-2 py-0.5 bg-verde-agua/10 text-verde-agua-dark text-xs rounded">
                          ✅ Aprovar
                        </span>
                      )}
                      {event.permissions.canDelete && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded">
                          🗑️ Deletar
                        </span>
                      )}
                      {event.permissions.canExport && (
                        <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">
                          📊 Exportar
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="space-y-2">
                    <button
                      onClick={() => router.push(`/admin/eventos/${event.slug}/participantes`)}
                      className="w-full py-2 bg-verde-agua text-white rounded-lg hover:bg-verde-agua-dark transition-colors font-semibold"
                    >
                      📊 Abrir Dashboard
                    </button>
                    {isSuperAdmin && (
                      <>
                        <button
                          onClick={() => router.push(`/admin/super/eventos/${event.slug}/editar`)}
                          className="w-full py-2 bg-azul-medio text-white rounded-lg hover:bg-azul-medio-dark transition-colors font-semibold text-sm"
                        >
                          ✏️ Editar Evento
                        </button>
                        <button
                          onClick={() => router.push(`/admin/eventos/${event.slug}/campos`)}
                          className="w-full py-2 bg-azul-marinho text-white rounded-lg hover:bg-azul-marinho-dark transition-colors font-semibold text-sm"
                        >
                          🔧 Gerenciar Campos
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => router.push(`/admin/access-control?event=${event.slug}`)}
                      className="w-full py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-semibold text-sm"
                    >
                      🚪 Controle de Acesso
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => router.push(`/eventos/${event.slug}/cadastro`)}
                        className="py-1.5 bg-cinza-100 text-cinza-700 rounded text-sm hover:bg-cinza-200 transition-colors"
                        title="Ver formulário público de cadastro"
                      >
                        🔗 URL Pública
                      </button>
                      {event.permissions.canExport && (
                        <button
                          onClick={() => window.open(`/api/export/participants?format=excel&event=${event.code}`)}
                          className="py-1.5 bg-verde/10 text-verde rounded text-sm hover:bg-verde/20 transition-colors"
                        >
                          📊 Excel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
