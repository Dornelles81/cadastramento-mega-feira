'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

interface Event {
  id: string
  name: string
  code: string
  slug: string
}

interface CustomField {
  id?: string
  eventId?: string
  fieldName: string
  label: string
  type: string
  required: boolean
  placeholder?: string
  options?: string[]
  order: number
  active: boolean
  validation?: any
}

const FIELD_TYPES = [
  { value: 'text', label: 'Texto' },
  { value: 'email', label: 'Email' },
  { value: 'tel', label: 'Telefone' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Data' },
  { value: 'select', label: 'Seleção' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'textarea', label: 'Texto Longo' },
  { value: 'file', label: '📎 Anexar Arquivo' }
]

export default function EventFieldsPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session, status } = useSession()
  const slug = params?.slug as string

  const [event, setEvent] = useState<Event | null>(null)
  const [fields, setFields] = useState<CustomField[]>([])
  const [editingField, setEditingField] = useState<CustomField | null>(null)
  const [showNewField, setShowNewField] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [authToken, setAuthToken] = useState<string>('')

  // Check authentication
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/api/auth/signin')
    }
  }, [status, router])

  // Auto-login and load event data
  useEffect(() => {
    const init = async () => {
      if (!slug || status !== 'authenticated') return

      // Auto-login to fields auth system
      let token = sessionStorage.getItem('adminFieldsAuth')
      if (!token) {
        try {
          console.log('🔐 Attempting auto-login...')
          const response = await fetch('/api/admin/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'admin123', action: 'login' })
          })

          console.log('📡 Response status:', response.status, response.statusText)

          const data = await response.json()
          console.log('📦 Response data:', data)

          if (response.ok && data.success) {
            token = data.token
            sessionStorage.setItem('adminFieldsAuth', token)
            console.log('✅ Auto-login successful, token:', token?.substring(0, 10) + '...')
          } else {
            console.error('❌ Auto-login failed. Status:', response.status, 'Data:', data)
            showNotification('error', 'Erro ao autenticar: ' + (data.error || 'Senha incorreta'))
            return
          }
        } catch (error) {
          console.error('💥 Failed to auto-login:', error)
          showNotification('error', 'Erro ao autenticar. Recarregue a página.')
          return
        }
      } else {
        console.log('🔑 Using existing token from sessionStorage')
      }

      // Store token in state
      setAuthToken(token)

      // Load event
      await loadEvent()
    }

    init()
  }, [slug, status])

  const loadEvent = async () => {
    try {
      const response = await fetch(`/api/public/eventos/${slug}`)
      if (!response.ok) {
        throw new Error('Evento não encontrado')
      }
      const data = await response.json()
      setEvent(data.event)

      // Load fields for this event
      await loadFields(data.event.id)
    } catch (error) {
      console.error('Error loading event:', error)
      showNotification('error', 'Erro ao carregar evento')
      setTimeout(() => router.push('/admin/dashboard'), 2000)
    } finally {
      setLoading(false)
    }
  }

  const loadFields = async (eventId: string) => {
    try {
      const token = authToken || sessionStorage.getItem('adminFieldsAuth')
      const response = await fetch(`/api/admin/fields?eventId=${eventId}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      })

      if (response.ok) {
        const data = await response.json()
        setFields(data.fields || [])
      }
    } catch (error) {
      console.error('Failed to load fields:', error)
      showNotification('error', 'Erro ao carregar campos')
    }
  }

  const handleSaveField = async (field: CustomField) => {
    if (!event) return

    try {
      if (!field.fieldName || !field.label) {
        showNotification('error', 'Nome do campo e rótulo são obrigatórios!')
        return
      }

      const token = authToken || sessionStorage.getItem('adminFieldsAuth')

      if (!token) {
        showNotification('error', 'Não autenticado. Recarregue a página.')
        console.error('❌ No auth token available')
        return
      }

      console.log('💾 Saving field with token:', token.substring(0, 10) + '...')

      const method = field.id ? 'PUT' : 'POST'

      const response = await fetch('/api/admin/fields', {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...field,
          eventId: event.id
        })
      })

      if (response.ok) {
        showNotification('success', 'Campo salvo com sucesso!')
        setEditingField(null)
        setShowNewField(false)
        await loadFields(event.id)
      } else {
        const data = await response.json()
        showNotification('error', data.error || 'Erro ao salvar campo')
      }
    } catch (error) {
      console.error('Error saving field:', error)
      showNotification('error', 'Erro ao salvar campo')
    }
  }

  const handleDeleteField = async (fieldId: string) => {
    if (!event || !confirm('Tem certeza que deseja excluir este campo?')) return

    try {
      const token = sessionStorage.getItem('adminFieldsAuth')
      const response = await fetch(`/api/admin/fields?id=${fieldId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        showNotification('success', 'Campo excluído com sucesso!')
        await loadFields(event.id)
      } else {
        showNotification('error', 'Erro ao excluir campo')
      }
    } catch (error) {
      console.error('Error deleting field:', error)
      showNotification('error', 'Erro ao excluir campo')
    }
  }

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 3000)
  }

  if (loading || status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">❌</div>
          <p className="text-gray-600">Evento não encontrado</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg ${
          notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        } text-white`}>
          {notification.message}
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 mb-2">
                🔧 Gerenciar Campos Personalizados
              </h1>
              <p className="text-gray-600">{event.name}</p>
              <p className="text-sm text-gray-500 mt-1">
                Código: <code className="bg-gray-100 px-2 py-1 rounded">{event.code}</code>
              </p>
            </div>
            <button
              onClick={() => router.push(`/admin/eventos/${slug}/participantes`)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              ← Voltar
            </button>
          </div>
        </div>

        {/* Fields List */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              Campos Personalizados ({fields.length})
            </h2>
            <button
              onClick={() => setShowNewField(true)}
              className="px-4 py-2 bg-mega-600 text-white rounded-lg hover:bg-mega-700 transition-colors"
            >
              + Adicionar Campo
            </button>
          </div>

          {fields.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-4xl mb-4">📝</p>
              <p>Nenhum campo personalizado configurado</p>
              <p className="text-sm mt-2">Clique em "Adicionar Campo" para criar um</p>
            </div>
          ) : (
            <div className="space-y-2">
              {fields.map((field) => (
                <div
                  key={field.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-mega-300 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-800">{field.label}</h3>
                        {field.required && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                            Obrigatório
                          </span>
                        )}
                        {!field.active && (
                          <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                            Inativo
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        Campo: <code className="bg-gray-100 px-1 rounded">{field.fieldName}</code> •
                        Tipo: {FIELD_TYPES.find(t => t.value === field.type)?.label || field.type}
                      </p>
                      {field.options && field.options.length > 0 && (
                        <p className="text-xs text-gray-400 mt-1">
                          Opções: {field.options.join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingField(field)}
                        className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => field.id && handleDeleteField(field.id)}
                        className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Field Editor Modal */}
      {(editingField || showNewField) && (
        <FieldEditor
          field={editingField || {
            fieldName: '',
            label: '',
            type: 'text',
            required: false,
            order: fields.length,
            active: true
          }}
          onSave={handleSaveField}
          onCancel={() => {
            setEditingField(null)
            setShowNewField(false)
          }}
        />
      )}
    </div>
  )
}

// Field Editor Component
function FieldEditor({
  field,
  onSave,
  onCancel
}: {
  field: CustomField
  onSave: (field: CustomField) => void
  onCancel: () => void
}) {
  const [editedField, setEditedField] = useState(field)
  const [options, setOptions] = useState(field.options?.join('\n') || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const fieldToSave = {
      ...editedField,
      options: editedField.type === 'select' ? options.split('\n').filter(o => o.trim()) : undefined
    }

    onSave(fieldToSave)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">
            {field.id ? 'Editar Campo' : 'Novo Campo'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome do Campo (fieldName)
              </label>
              <input
                type="text"
                value={editedField.fieldName}
                onChange={(e) => setEditedField({ ...editedField, fieldName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mega-500"
                placeholder="ex: empresa, cargo, setor"
                required
                disabled={!!field.id}
              />
              <p className="text-xs text-gray-500 mt-1">
                Usado internamente. Apenas letras, números e underscore.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rótulo (Label)
              </label>
              <input
                type="text"
                value={editedField.label}
                onChange={(e) => setEditedField({ ...editedField, label: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mega-500"
                placeholder="ex: Nome da Empresa, Cargo, Setor"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo
              </label>
              <select
                value={editedField.type}
                onChange={(e) => setEditedField({ ...editedField, type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mega-500"
                required
              >
                {FIELD_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            {editedField.type === 'select' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Opções (uma por linha)
                </label>
                <textarea
                  value={options}
                  onChange={(e) => setOptions(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mega-500"
                  rows={5}
                  placeholder="Opção 1&#10;Opção 2&#10;Opção 3"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Placeholder (opcional)
              </label>
              <input
                type="text"
                value={editedField.placeholder || ''}
                onChange={(e) => setEditedField({ ...editedField, placeholder: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mega-500"
                placeholder="Texto de exemplo"
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editedField.required}
                  onChange={(e) => setEditedField({ ...editedField, required: e.target.checked })}
                  className="w-4 h-4 text-mega-600 rounded"
                />
                <span className="text-sm text-gray-700">Campo Obrigatório</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editedField.active}
                  onChange={(e) => setEditedField({ ...editedField, active: e.target.checked })}
                  className="w-4 h-4 text-mega-600 rounded"
                />
                <span className="text-sm text-gray-700">Campo Ativo</span>
              </label>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-mega-600 text-white rounded-lg hover:bg-mega-700 transition-colors font-medium"
              >
                Salvar Campo
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
