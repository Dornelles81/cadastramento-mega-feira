'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface DocumentConfig {
  id?: string
  documentType: string
  label: string
  description?: string
  required: boolean
  enableOCR: boolean
  acceptedFormats?: string[]
  maxSizeMB: number
  order: number
  active: boolean
  eventCode?: string
}

export default function DocumentsAdminPage() {
  const router = useRouter()
  const [documents, setDocuments] = useState<DocumentConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    loadDocuments()
  }, [])

  const loadDocuments = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/document-config')
      const data = await response.json()
      setDocuments(data.documents || [])
    } catch (error) {
      console.error('Error loading documents:', error)
      setMessage({ type: 'error', text: 'Erro ao carregar documentos' })
    } finally {
      setLoading(false)
    }
  }

  // Função initializeDefaults removida - não há documentos padrão

  const toggleDocument = async (doc: DocumentConfig, field: 'active' | 'required' | 'enableOCR') => {
    try {
      setSaving(doc.id || doc.documentType)
      
      const updatedDoc = { ...doc, [field]: !doc[field] }
      
      const response = await fetch('/api/admin/document-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedDoc)
      })
      
      if (response.ok) {
        setDocuments(docs => docs.map(d => 
          d.id === doc.id ? updatedDoc : d
        ))
        setMessage({ 
          type: 'success', 
          text: `${doc.label} ${field === 'active' ? (updatedDoc.active ? 'ativado' : 'desativado') : 'atualizado'}!`
        })
      }
    } catch (error) {
      console.error('Error updating document:', error)
      setMessage({ type: 'error', text: 'Erro ao atualizar documento' })
    } finally {
      setSaving(null)
    }
  }

  const updateOrder = async (doc: DocumentConfig, direction: 'up' | 'down') => {
    const index = documents.findIndex(d => d.id === doc.id)
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === documents.length - 1)) {
      return
    }

    const newDocs = [...documents]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    
    // Swap orders
    const tempOrder = newDocs[index].order
    newDocs[index].order = newDocs[targetIndex].order
    newDocs[targetIndex].order = tempOrder as number
    
    // Swap positions in array
    [newDocs[index], newDocs[targetIndex]] = [newDocs[targetIndex], newDocs[index]]
    
    setDocuments(newDocs)
    
    // Save both documents
    try {
      setSaving(doc.id || doc.documentType)
      await Promise.all([
        fetch('/api/admin/document-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newDocs[index])
        }),
        fetch('/api/admin/document-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newDocs[targetIndex])
        })
      ])
    } catch (error) {
      console.error('Error updating order:', error)
      loadDocuments() // Reload on error
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-lg shadow p-8">
            <div className="text-center">
              <div className="spinner mx-auto mb-4"></div>
              <p className="text-gray-500">Carregando configurações...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow mb-6 p-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                📄 Configuração de Documentos
              </h1>
              <p className="text-gray-600 mt-1">
                Configure quais documentos serão solicitados no cadastro.
              </p>
              <p className="text-yellow-600 text-sm mt-2">
                ⚠️ <strong>Importante:</strong> Nenhum documento é solicitado por padrão. 
                Você deve ativar e marcar como obrigatório os documentos que deseja solicitar.
              </p>
            </div>
            <button
              onClick={() => router.push('/admin')}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
            >
              ← Voltar
            </button>
          </div>
        </div>

        {/* Messages */}
        {message && (
          <div className={`mb-4 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        {/* No documents message */}
        {documents.length === 0 && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-8 text-center">
            <div className="text-yellow-600 mb-4">
              <span className="text-4xl">📋</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              Nenhum documento configurado
            </h3>
            <p className="text-gray-600 mb-4">
              O sistema não está solicitando nenhum documento no momento.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Para solicitar documentos dos usuários, você pode adicionar configurações de documentos 
              usando o botão abaixo.
            </p>
            <button
              onClick={() => {
                // Criar documento em branco
                const newDoc: DocumentConfig = {
                  documentType: 'novo_documento',
                  label: 'Novo Documento',
                  description: 'Configure este documento',
                  required: false,
                  enableOCR: false,
                  acceptedFormats: ['jpg', 'jpeg', 'png'],
                  maxSizeMB: 5,
                  order: 0,
                  active: false
                }
                setDocuments([newDoc])
              }}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              ➕ Adicionar Configuração de Documento
            </button>
          </div>
        )}

        {/* Documents List */}
        {documents.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b bg-gray-50">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="font-semibold text-gray-700">Tipos de Documento Disponíveis</h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Ative e marque como "Obrigatório" os documentos que deseja solicitar
                  </p>
                </div>
                <button
                  onClick={async () => {
                    // Adicionar novo documento
                    const newDoc: DocumentConfig = {
                      documentType: `documento_${Date.now()}`,
                      label: 'Novo Documento',
                      description: '',
                      required: false,
                      enableOCR: false,
                      acceptedFormats: ['jpg', 'jpeg', 'png'],
                      maxSizeMB: 5,
                      order: documents.length,
                      active: false
                    }
                    
                    try {
                      const response = await fetch('/api/admin/document-config', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newDoc)
                      })
                      
                      if (response.ok) {
                        await loadDocuments()
                      }
                    } catch (error) {
                      console.error('Error adding document:', error)
                    }
                  }}
                  className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
                >
                  ➕ Adicionar Documento
                </button>
              </div>
            </div>
            
            <div className="divide-y">
              {documents.sort((a, b) => a.order - b.order).map((doc, index) => (
                <div key={doc.id || doc.documentType} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-gray-800">
                          {doc.label}
                        </h3>
                        <span className={`text-xs px-2 py-1 rounded ${
                          doc.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {doc.active ? 'Ativo' : 'Inativo'}
                        </span>
                        {doc.required && (
                          <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded">
                            Obrigatório
                          </span>
                        )}
                        {doc.enableOCR && (
                          <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                            OCR
                          </span>
                        )}
                      </div>
                      
                      {doc.description && (
                        <p className="text-sm text-gray-600 mt-1">{doc.description}</p>
                      )}
                      
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span>Tipo: {doc.documentType}</span>
                        <span>Formatos: {doc.acceptedFormats?.join(', ')}</span>
                        <span>Máx: {doc.maxSizeMB}MB</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {/* Order buttons */}
                      <div className="flex flex-col">
                        <button
                          onClick={() => updateOrder(doc, 'up')}
                          disabled={index === 0 || saving === doc.id}
                          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => updateOrder(doc, 'down')}
                          disabled={index === documents.length - 1 || saving === doc.id}
                          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        >
                          ▼
                        </button>
                      </div>
                      
                      {/* Toggle switches */}
                      <div className="flex flex-col gap-2 ml-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={doc.active}
                            onChange={() => toggleDocument(doc, 'active')}
                            disabled={saving === doc.id}
                            className="h-4 w-4"
                          />
                          <span className="text-sm">Ativo</span>
                        </label>
                        
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={doc.required}
                            onChange={() => toggleDocument(doc, 'required')}
                            disabled={saving === doc.id || !doc.active}
                            className="h-4 w-4"
                          />
                          <span className="text-sm">Obrigatório</span>
                        </label>
                        
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={doc.enableOCR}
                            onChange={() => toggleDocument(doc, 'enableOCR')}
                            disabled={saving === doc.id || !doc.active}
                            className="h-4 w-4"
                          />
                          <span className="text-sm">OCR</span>
                        </label>
                      </div>
                      
                      {saving === (doc.id || doc.documentType) && (
                        <div className="spinner ml-2"></div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="mt-6 bg-blue-50 rounded-lg p-4">
          <h3 className="font-semibold text-blue-800 mb-2">📝 Instruções</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• <strong>Ativo:</strong> Documento aparece no formulário de cadastro</li>
            <li>• <strong>Obrigatório:</strong> Usuário deve enviar o documento para continuar</li>
            <li>• <strong>OCR:</strong> Sistema tenta extrair dados automaticamente (CPF, RG, etc)</li>
            <li>• Use as setas para reordenar os documentos</li>
            <li>• Mudanças são salvas automaticamente</li>
          </ul>
        </div>
      </div>

      <style jsx>{`
        .spinner {
          border: 3px solid #f3f3f3;
          border-top: 3px solid #3498db;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}