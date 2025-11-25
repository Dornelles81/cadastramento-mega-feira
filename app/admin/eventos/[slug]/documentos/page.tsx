'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

interface DocumentConfig {
  id: string
  documentType: string
  label: string
  description?: string
  required: boolean
  enableOCR: boolean
  acceptedFormats: string[]
  maxSizeMB: number
  order: number
  icon?: string
  helpText?: string
  active: boolean
}

interface Event {
  id: string
  name: string
  slug: string
}

export default function EventDocumentosPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session, status } = useSession()
  const eventSlug = params?.slug as string

  const [event, setEvent] = useState<Event | null>(null)
  const [documents, setDocuments] = useState<DocumentConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [editingDoc, setEditingDoc] = useState<DocumentConfig | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const [formData, setFormData] = useState({
    documentType: '',
    label: '',
    description: '',
    required: false,
    enableOCR: false,
    acceptedFormats: ['jpg', 'jpeg', 'png', 'pdf'],
    maxSizeMB: 5,
    order: 0,
    icon: '',
    helpText: ''
  })

  // Redirect if not authenticated or not super admin
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/admin/login')
    } else if (status === 'authenticated') {
      const user = session?.user as any
      if (user?.role !== 'SUPER_ADMIN') {
        router.push('/admin/dashboard')
      }
    }
  }, [status, session, router])

  // Load documents
  useEffect(() => {
    if (status === 'authenticated' && eventSlug) {
      loadDocuments()
    }
  }, [status, eventSlug])

  const loadDocuments = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/admin/eventos/${eventSlug}/documentos`)
      if (response.ok) {
        const data = await response.json()
        setDocuments(data.documents || [])
        setEvent(data.event)
      }
    } catch (error) {
      console.error('Error loading documents:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      const url = editingDoc
        ? `/api/admin/eventos/${eventSlug}/documentos?id=${editingDoc.id}`
        : `/api/admin/eventos/${eventSlug}/documentos`

      const method = editingDoc ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        await loadDocuments()
        setEditingDoc(null)
        setIsCreating(false)
        resetForm()
      }
    } catch (error) {
      console.error('Error saving document:', error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente remover este documento?')) return

    try {
      const response = await fetch(`/api/admin/eventos/${eventSlug}/documentos?id=${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await loadDocuments()
      }
    } catch (error) {
      console.error('Error deleting document:', error)
    }
  }

  const startEdit = (doc: DocumentConfig) => {
    setEditingDoc(doc)
    setFormData({
      documentType: doc.documentType,
      label: doc.label,
      description: doc.description || '',
      required: doc.required,
      enableOCR: doc.enableOCR,
      acceptedFormats: doc.acceptedFormats,
      maxSizeMB: doc.maxSizeMB,
      order: doc.order,
      icon: doc.icon || '',
      helpText: doc.helpText || ''
    })
  }

  const resetForm = () => {
    setFormData({
      documentType: '',
      label: '',
      description: '',
      required: false,
      enableOCR: false,
      acceptedFormats: ['jpg', 'jpeg', 'png', 'pdf'],
      maxSizeMB: 5,
      order: 0,
      icon: '',
      helpText: ''
    })
  }

  const cancel = () => {
    setEditingDoc(null)
    setIsCreating(false)
    resetForm()
  }

  if (loading || status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">⏳</div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                📄 Configuração de Documentos
              </h1>
              <p className="text-gray-600 mt-1">
                {event?.name}
              </p>
              <p className="text-sm text-orange-600 mt-2">
                ⚠️ Importante: Nenhum documento é solicitado por padrão. Ative e marque como obrigatório os documentos que deseja solicitar.
              </p>
            </div>
            <button
              onClick={() => router.push(`/admin/eventos/${eventSlug}`)}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              ← Voltar
            </button>
          </div>
        </div>

        {/* Add Document Button */}
        {!isCreating && !editingDoc && (
          <div className="mb-6">
            <button
              onClick={() => setIsCreating(true)}
              className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-semibold"
            >
              ➕ Adicionar Documento
            </button>
          </div>
        )}

        {/* Create/Edit Form */}
        {(isCreating || editingDoc) && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">
              {editingDoc ? '✏️ Editar Documento' : '➕ Novo Documento'}
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo *
                </label>
                <input
                  type="text"
                  value={formData.documentType}
                  onChange={(e) => setFormData({ ...formData, documentType: e.target.value })}
                  placeholder="rg, cnh, cpf_doc, etc"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Label *
                </label>
                <input
                  type="text"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder="RG (Carteira de Identidade)"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descrição
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Envie foto frente e verso do RG"
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tamanho Máximo (MB)
                </label>
                <input
                  type="number"
                  value={formData.maxSizeMB}
                  onChange={(e) => setFormData({ ...formData, maxSizeMB: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ordem
                </label>
                <input
                  type="number"
                  value={formData.order}
                  onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="col-span-2 space-y-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.required}
                    onChange={(e) => setFormData({ ...formData, required: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm font-medium">Obrigatório</span>
                </label>

                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.enableOCR}
                    onChange={(e) => setFormData({ ...formData, enableOCR: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm font-medium">Habilitar OCR</span>
                </label>
              </div>
            </div>

            <div className="mt-4 flex space-x-3">
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                💾 Salvar
              </button>
              <button
                onClick={cancel}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Documents List */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">
            Tipos de Documento Disponíveis
          </h2>

          {documents.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <div className="text-6xl mb-4">📭</div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">
                Nenhum documento configurado
              </h3>
              <p className="text-gray-500">
                Clique em "Adicionar Documento" para criar a primeira configuração
              </p>
            </div>
          ) : (
            documents.map((doc) => (
              <div key={doc.id} className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold">{doc.label}</h3>
                      {doc.required && (
                        <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded">
                          Obrigatório
                        </span>
                      )}
                      {doc.enableOCR && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                          OCR
                        </span>
                      )}
                      {!doc.active && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                          Inativo
                        </span>
                      )}
                    </div>

                    {doc.description && (
                      <p className="text-gray-600 text-sm mb-2">{doc.description}</p>
                    )}

                    <div className="text-xs text-gray-500">
                      <span>Tipo: {doc.documentType}</span>
                      <span className="ml-4">Formatos: {doc.acceptedFormats.join(', ')}</span>
                      <span className="ml-4">Máx: {doc.maxSizeMB}MB</span>
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={() => startEdit(doc)}
                      className="px-3 py-1 bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
                    >
                      ✏️ Editar
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      🗑️ Excluir
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
