'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

export default function NovoEventoPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [formData, setFormData] = useState({
    slug: '',
    name: '',
    code: '',
    description: '',
    startDate: '',
    endDate: '',
    maxCapacity: 2000,
    organizerName: '',
    organizerEmail: '',
    organizerPhone: '',
    venueName: '',
    venueAddress: '',
    venueCity: '',
    venueState: 'RS',
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
  }, [status, session])

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    setFormData({
      ...formData,
      name,
      slug: name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
    })
  }

  // Auto-generate code from name
  const handleCodeGenerate = () => {
    const code = formData.name
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    setFormData({ ...formData, code })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/admin/eventos/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao criar evento')
      }

      // Success! Redirect to event dashboard
      alert(`✅ Evento "${data.event.name}" criado com sucesso!`)
      router.push(`/admin/eventos/${data.event.slug}/participantes`)
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">⏳</div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!session || session.user.role !== 'SUPER_ADMIN') {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                ➕ Criar Novo Evento
              </h1>
              <p className="text-sm text-gray-600">
                Configure um novo evento para cadastramento
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
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  placeholder="Ex: Mega Feira 2026"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Slug (URL) *
                </label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 font-mono text-sm"
                  placeholder="mega-feira-2026"
                  pattern="[a-z0-9-]+"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Usado na URL: /eventos/{formData.slug}/cadastro
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Código do Sistema *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 font-mono text-sm"
                    placeholder="MEGA-FEIRA-2026"
                    pattern="[A-Z0-9-]+"
                    required
                  />
                  <button
                    type="button"
                    onClick={handleCodeGenerate}
                    className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                    title="Gerar automaticamente"
                  >
                    🔄
                  </button>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descrição
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  min="1"
                />
              </div>
            </div>
          </div>

          {/* Organizer */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              👤 Organizador
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome do Organizador
                </label>
                <input
                  type="text"
                  value={formData.organizerName}
                  onChange={(e) => setFormData({ ...formData, organizerName: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  placeholder="Equipe Mega Feira"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email do Organizador
                </label>
                <input
                  type="email"
                  value={formData.organizerEmail}
                  onChange={(e) => setFormData({ ...formData, organizerEmail: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  placeholder="contato@megafeira.com.br"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Telefone do Organizador
                </label>
                <input
                  type="tel"
                  value={formData.organizerPhone}
                  onChange={(e) => setFormData({ ...formData, organizerPhone: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  placeholder="(51) 99999-9999"
                />
              </div>
            </div>
          </div>

          {/* Venue */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              📍 Local do Evento
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome do Local
                </label>
                <input
                  type="text"
                  value={formData.venueName}
                  onChange={(e) => setFormData({ ...formData, venueName: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  placeholder="Parque de Exposições"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Endereço
                </label>
                <input
                  type="text"
                  value={formData.venueAddress}
                  onChange={(e) => setFormData({ ...formData, venueAddress: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  placeholder="Av. Assis Brasil, 10000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cidade
                </label>
                <input
                  type="text"
                  value={formData.venueCity}
                  onChange={(e) => setFormData({ ...formData, venueCity: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  placeholder="Esteio"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Estado
                </label>
                <select
                  value={formData.venueState}
                  onChange={(e) => setFormData({ ...formData, venueState: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                >
                  <option value="AC">Acre</option>
                  <option value="AL">Alagoas</option>
                  <option value="AP">Amapá</option>
                  <option value="AM">Amazonas</option>
                  <option value="BA">Bahia</option>
                  <option value="CE">Ceará</option>
                  <option value="DF">Distrito Federal</option>
                  <option value="ES">Espírito Santo</option>
                  <option value="GO">Goiás</option>
                  <option value="MA">Maranhão</option>
                  <option value="MT">Mato Grosso</option>
                  <option value="MS">Mato Grosso do Sul</option>
                  <option value="MG">Minas Gerais</option>
                  <option value="PA">Pará</option>
                  <option value="PB">Paraíba</option>
                  <option value="PR">Paraná</option>
                  <option value="PE">Pernambuco</option>
                  <option value="PI">Piauí</option>
                  <option value="RJ">Rio de Janeiro</option>
                  <option value="RN">Rio Grande do Norte</option>
                  <option value="RS">Rio Grande do Sul</option>
                  <option value="RO">Rondônia</option>
                  <option value="RR">Roraima</option>
                  <option value="SC">Santa Catarina</option>
                  <option value="SP">São Paulo</option>
                  <option value="SE">Sergipe</option>
                  <option value="TO">Tocantins</option>
                </select>
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
              {loading ? '⏳ Criando evento...' : '✨ Criar Evento'}
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
