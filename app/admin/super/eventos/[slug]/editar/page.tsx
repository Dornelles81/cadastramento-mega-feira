'use client'

import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'

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
    logoUrl?: string
    primaryColor?: string
    secondaryColor?: string
    accentColor?: string
    requireConsent?: boolean
    requireFace?: boolean
    requireDocuments?: boolean
    autoApprove?: boolean
    enableCheckIn?: boolean
    enableQRCode?: boolean
    successMessage?: string
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
  const [logoPreview, setLogoPreview] = useState<string>('')
  const [logoUploading, setLogoUploading] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

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
    logoUrl: '',
    primaryColor: '#8B5CF6',
    secondaryColor: '#EC4899',
    accentColor: '#F59E0B',
    requireConsent: true,
    requireFace: true,
    requireDocuments: false,
    autoApprove: false,
    enableCheckIn: true,
    enableQRCode: true,
    successMessage: ''
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

      const existingLogoUrl = event.eventConfigs?.logoUrl || ''
      setFormData({
        name: event.name || '',
        description: event.description || '',
        startDate: formatDateForInput(event.startDate),
        endDate: formatDateForInput(event.endDate),
        maxCapacity: event.maxCapacity || 2000,
        status: event.status || 'draft',
        isActive: event.isActive !== undefined ? event.isActive : true,
        isPublic: event.isPublic !== undefined ? event.isPublic : true,
        logoUrl: existingLogoUrl,
        primaryColor: event.eventConfigs?.primaryColor || '#8B5CF6',
        secondaryColor: event.eventConfigs?.secondaryColor || '#EC4899',
        accentColor: event.eventConfigs?.accentColor || '#F59E0B',
        requireConsent: event.eventConfigs?.requireConsent !== undefined ? event.eventConfigs.requireConsent : true,
        requireFace: event.eventConfigs?.requireFace !== undefined ? event.eventConfigs.requireFace : true,
        requireDocuments: event.eventConfigs?.requireDocuments !== undefined ? event.eventConfigs.requireDocuments : false,
        autoApprove: event.eventConfigs?.autoApprove !== undefined ? event.eventConfigs.autoApprove : false,
        enableCheckIn: event.eventConfigs?.enableCheckIn !== undefined ? event.eventConfigs.enableCheckIn : true,
        enableQRCode: event.eventConfigs?.enableQRCode !== undefined ? event.eventConfigs.enableQRCode : true,
        successMessage: event.eventConfigs?.successMessage || 'Cadastro realizado com sucesso! Retire sua credencial física na secretaria do parque.'
      })
      if (existingLogoUrl) setLogoPreview(existingLogoUrl)

      setLoadingEvent(false)
    } catch (err: any) {
      setError(err.message)
      setLoadingEvent(false)
    }
  }

  const handleLogoUpload = async (file: File) => {
    if (!file) return
    setLogoUploading(true)
    try {
      const formDataUpload = new FormData()
      formDataUpload.append('file', file)
      const response = await fetch('/api/admin/upload-logo', {
        method: 'POST',
        body: formDataUpload
      })
      if (!response.ok) throw new Error('Erro ao fazer upload')
      const data = await response.json()
      const url = data.url
      setFormData(prev => ({ ...prev, logoUrl: url }))
      setLogoPreview(url)
    } catch (err: any) {
      setError('Erro ao fazer upload da logo: ' + err.message)
    } finally {
      setLogoUploading(false)
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

          {/* Logo do Evento */}
          <div className="bg-white rounded-lg shadow-sm p-6 border-2 border-dashed border-purple-200">
            <h2 className="text-lg font-bold text-gray-800 mb-1">
              🖼️ Logo do Evento
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              A marca do evento exibida na tela inicial do cadastro.
            </p>
            <div className="flex items-start gap-6">
              <div className="bg-white border border-gray-200 rounded-2xl shadow p-4 flex items-center justify-center" style={{ minWidth: '180px', minHeight: '100px' }}>
                {logoPreview ? (
                  <div className="relative">
                    <img
                      src={logoPreview}
                      alt="Logo do evento"
                      className="max-h-20 w-auto object-contain"
                      style={{ maxWidth: '200px' }}
                    />
                    <button
                      type="button"
                      onClick={() => { setLogoPreview(''); setFormData(prev => ({ ...prev, logoUrl: '' })) }}
                      className="absolute -top-3 -right-3 w-6 h-6 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 flex items-center justify-center"
                      title="Remover logo"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <span className="text-gray-300 text-sm text-center">Prévia do logo<br />aqui</span>
                )}
              </div>
              <div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleLogoUpload(file)
                  }}
                />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoUploading}
                  className="px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium disabled:opacity-50 shadow-sm"
                >
                  {logoUploading ? '⏳ Enviando...' : '📁 Selecionar logo'}
                </button>
                <p className="text-xs text-gray-500 mt-2">PNG, JPG, SVG ou WebP · máx. 5MB</p>
                <p className="text-xs text-gray-400 mt-1">Recomendado: fundo transparente ou branco</p>
              </div>
            </div>
          </div>

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
            <div className="space-y-4">
              {/* Colors */}
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

          {/* Success Message */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">💬 Mensagem de Sucesso</h2>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Texto exibido após o cadastro ser realizado
            </label>
            <textarea
              value={formData.successMessage}
              onChange={(e) => setFormData({ ...formData, successMessage: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white text-gray-900"
              rows={3}
              placeholder="Ex: Retire sua credencial física na secretaria do parque."
            />
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

        {/* Danger Zone */}
        <div className="mt-8 border border-red-200 rounded-xl p-6 bg-red-50">
          <h3 className="text-lg font-bold text-red-700 mb-1">⚠️ Zona de Perigo</h3>
          <p className="text-sm text-red-600 mb-4">
            Excluir o evento remove permanentemente todos os participantes, stands, credenciais e registros associados. Esta ação não pode ser desfeita.
          </p>
          <button
            type="button"
            onClick={async () => {
              if (!event) return
              if (!confirm(`Tem certeza que deseja excluir o evento "${event.name}"?\n\nEsta ação é IRREVERSÍVEL e apagará todos os dados associados.`)) return
              if (!confirm(`Confirme novamente: excluir permanentemente "${event.name}"?`)) return
              setLoading(true)
              try {
                const res = await fetch(`/api/admin/eventos/${eventSlug}`, { method: 'DELETE' })
                const data = await res.json()
                if (res.ok) {
                  alert('Evento excluído com sucesso.')
                  router.push('/admin/super/eventos/novo')
                } else {
                  setError(data.error || 'Erro ao excluir evento')
                }
              } catch {
                setError('Erro de conexão')
              } finally {
                setLoading(false)
              }
            }}
            disabled={loading}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold transition-colors"
          >
            🗑️ Excluir Evento Permanentemente
          </button>
        </div>
      </div>
    </div>
  )
}
