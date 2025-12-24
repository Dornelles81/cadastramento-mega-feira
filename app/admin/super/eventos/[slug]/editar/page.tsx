'use client'

import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect } from 'react'

interface Event {
  id: string
  slug: string
  name: string
  code: string
  description: string | null
  startDate: string
  endDate: string
  maxCapacity: number
  status: string
  isActive: boolean
  isPublic: boolean
  eventConfigs?: {
    primaryColor?: string
    secondaryColor?: string
    accentColor?: string
    requireConsent?: boolean
    requireFace?: boolean
    requireDocuments?: boolean
    autoApprove?: boolean
    enableCheckIn?: boolean
    enableQRCode?: boolean
  }
}

export default function EditarEventoPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const eventSlug = params?.slug as string

  const [loading, setLoading] = useState(false)
  const [loadingEvent, setLoadingEvent] = useState(true)
  const [error, setError] = useState('')
  const [event, setEvent] = useState<Event | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    startDate: '',
    endDate: '',
    maxCapacity: 2000,
    status: 'draft',
    isActive: true,
    isPublic: true,
    primaryColor: '#8B5CF6',
    secondaryColor: '#EC4899',
    accentColor: '#F59E0B',
    requireConsent: true,
    requireFace: true,
    requireDocuments: false,
    autoApprove: false,
    enableCheckIn: true,
    enableQRCode: true
  })

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/admin/login')
    }

    if (status === 'authenticated' && session?.user?.role !== 'SUPER_ADMIN') {
      router.push('/admin/dashboard')
    }

    if (status === 'authenticated' && eventSlug) {
      loadEvent()
    }
  }, [status, session, eventSlug])

  const loadEvent = async () => {
    try {
      const response = await fetch(`/api/admin/eventos/${eventSlug}`)
      if (!response.ok) {
        throw new Error('Evento não encontrado')
      }

      const data = await response.json()
      const event = data.event

      setEvent(event)

      // Populate form with existing data
      // Convert dates to local date strings to avoid timezone issues
      // The dates are stored in UTC, so we need to extract just the date part correctly
      const formatDateForInput = (dateStr: string) => {
        if (!dateStr) return ''
        // Parse the date and format it as YYYY-MM-DD in local timezone
        const date = new Date(dateStr)
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }

      setFormData({
        name: event.name || '',
        description: event.description || '',
        startDate: formatDateForInput(event.startDate),
        endDate: formatDateForInput(event.endDate),
        maxCapacity: event.maxCapacity || 2000,
        status: event.status || 'draft',
        isActive: event.isActive !== undefined ? event.isActive : true,
        isPublic: event.isPublic !== undefined ? event.isPublic : true,
        primaryColor: event.eventConfigs?.primaryColor || '#8B5CF6',
        secondaryColor: event.eventConfigs?.secondaryColor || '#EC4899',
        accentColor: event.eventConfigs?.accentColor || '#F59E0B',
        requireConsent: event.eventConfigs?.requireConsent !== undefined ? event.eventConfigs.requireConsent : true,
        requireFace: event.eventConfigs?.requireFace !== undefined ? event.eventConfigs.requireFace : true,
        requireDocuments: event.eventConfigs?.requireDocuments !== undefined ? event.eventConfigs.requireDocuments : false,
        autoApprove: event.eventConfigs?.autoApprove !== undefined ? event.eventConfigs.autoApprove : false,
        enableCheckIn: event.eventConfigs?.enableCheckIn !== undefined ? event.eventConfigs.enableCheckIn : true,
        enableQRCode: event.eventConfigs?.enableQRCode !== undefined ? event.eventConfigs.enableQRCode : true
      })

      setLoadingEvent(false)
    } catch (err: any) {
      setError(err.message)
      setLoadingEvent(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch(`/api/admin/eventos/${eventSlug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao atualizar evento')
      }

      // Success! Redirect to dashboard
      alert(`✅ Evento "${data.event.name}" atualizado com sucesso!`)
      router.push('/admin/dashboard')
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  if (status === 'loading' || loadingEvent) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">⏳</div>
          <p className="text-gray-600">Carregando evento...</p>
        </div>
      </div>
    )
  }

  if (!session || session.user.role !== 'SUPER_ADMIN') {
    return null
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <p className="text-gray-600 mb-4">{error || 'Evento não encontrado'}</p>
          <button
            onClick={() => router.push('/admin/dashboard')}
            className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
          >
            ← Voltar ao Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                ✏️ Editar Evento
              </h1>
              <p className="text-sm text-gray-600">
                {event.name} ({event.code})
              </p>
            </div>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              ← Voltar
            </button>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm">❌ {error}</p>
            </div>
          )}

          {/* Basic Information */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              📋 Informações Básicas
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome do Evento *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white text-gray-900"
                  placeholder="Ex: Mega Feira 2026"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Slug (URL) - Não editável
                </label>
                <input
                  type="text"
                  value={event.slug}
                  disabled
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 font-mono text-sm cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">
                  O slug não pode ser alterado após a criação
                </p>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Código do Sistema - Não editável
                </label>
                <input
                  type="text"
                  value={event.code}
                  disabled
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 font-mono text-sm cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">
                  O código não pode ser alterado após a criação
                </p>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descrição
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white text-gray-900"
                  rows={3}
                  placeholder="Descrição do evento..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Data de Início *
                </label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white text-gray-900"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Data de Término *
                </label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white text-gray-900"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Capacidade Máxima
                </label>
                <input
                  type="number"
                  value={formData.maxCapacity}
                  onChange={(e) => setFormData({ ...formData, maxCapacity: parseInt(e.target.value) })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white text-gray-900"
                  min="1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white text-gray-900"
                >
                  <option value="draft">Rascunho</option>
                  <option value="published">Publicado</option>
                  <option value="active">Ativo</option>
                  <option value="completed">Concluído</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-5 h-5 text-purple-600 rounded"
                  />
                  <div>
                    <div className="font-medium text-gray-800">Evento Ativo</div>
                    <div className="text-sm text-gray-600">Evento disponível no sistema</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                  <input
                    type="checkbox"
                    checked={formData.isPublic}
                    onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                    className="w-5 h-5 text-purple-600 rounded"
                  />
                  <div>
                    <div className="font-medium text-gray-800">Cadastro Público</div>
                    <div className="text-sm text-gray-600">Qualquer pessoa pode se cadastrar</div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Customization */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              🎨 Personalização Visual
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cor Primária
                </label>
                <input
                  type="color"
                  value={formData.primaryColor}
                  onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                  className="w-full h-12 border border-gray-300 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cor Secundária
                </label>
                <input
                  type="color"
                  value={formData.secondaryColor}
                  onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                  className="w-full h-12 border border-gray-300 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cor de Destaque
                </label>
                <input
                  type="color"
                  value={formData.accentColor}
                  onChange={(e) => setFormData({ ...formData, accentColor: e.target.value })}
                  className="w-full h-12 border border-gray-300 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Settings */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              ⚙️ Configurações
            </h2>
            <div className="space-y-3">
              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={formData.requireConsent}
                  onChange={(e) => setFormData({ ...formData, requireConsent: e.target.checked })}
                  className="w-5 h-5 text-purple-600 rounded"
                />
                <div>
                  <div className="font-medium text-gray-800">Exigir Consentimento LGPD</div>
                  <div className="text-sm text-gray-600">Participante deve aceitar termos de uso de dados</div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={formData.requireFace}
                  onChange={(e) => setFormData({ ...formData, requireFace: e.target.checked })}
                  className="w-5 h-5 text-purple-600 rounded"
                />
                <div>
                  <div className="font-medium text-gray-800">Exigir Foto Facial</div>
                  <div className="text-sm text-gray-600">Captura de foto facial é obrigatória</div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={formData.requireDocuments}
                  onChange={(e) => setFormData({ ...formData, requireDocuments: e.target.checked })}
                  className="w-5 h-5 text-purple-600 rounded"
                />
                <div>
                  <div className="font-medium text-gray-800">Exigir Documentos</div>
                  <div className="text-sm text-gray-600">Upload de documentos é obrigatório</div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={formData.autoApprove}
                  onChange={(e) => setFormData({ ...formData, autoApprove: e.target.checked })}
                  className="w-5 h-5 text-purple-600 rounded"
                />
                <div>
                  <div className="font-medium text-gray-800">Auto-aprovar Cadastros</div>
                  <div className="text-sm text-gray-600">Cadastros são aprovados automaticamente</div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={formData.enableCheckIn}
                  onChange={(e) => setFormData({ ...formData, enableCheckIn: e.target.checked })}
                  className="w-5 h-5 text-purple-600 rounded"
                />
                <div>
                  <div className="font-medium text-gray-800">Habilitar Check-in</div>
                  <div className="text-sm text-gray-600">Funcionalidade de check-in no evento</div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={formData.enableQRCode}
                  onChange={(e) => setFormData({ ...formData, enableQRCode: e.target.checked })}
                  className="w-5 h-5 text-purple-600 rounded"
                />
                <div>
                  <div className="font-medium text-gray-800">Gerar QR Codes</div>
                  <div className="text-sm text-gray-600">Cada participante recebe um QR code único</div>
                </div>
              </label>
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-4 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-lg font-semibold hover:from-purple-700 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg text-lg"
            >
              {loading ? '⏳ Salvando alterações...' : '💾 Salvar Alterações'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-8 py-4 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
