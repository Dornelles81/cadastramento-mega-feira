'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

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
  validation?: {
    hasLimits?: boolean
    optionLimits?: Record<string, number>
    maxSize?: number
    enableOCR?: boolean
    ocrType?: string
  }
}

interface Event {
  id: string
  name: string
  slug: string
  code: string
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
  { value: 'file', label: '📎 Anexar Arquivo/Documento' }
]

const OCR_TYPES = [
  { value: '', label: 'Nenhum (apenas upload)' },
  { value: 'cpf', label: 'Extrair CPF' },
  { value: 'rg', label: 'Extrair RG' },
  { value: 'cnh', label: 'Extrair CNH' },
  { value: 'nome', label: 'Extrair Nome' },
  { value: 'data_nascimento', label: 'Extrair Data de Nascimento' },
  { value: 'all', label: 'Extrair todos os dados possíveis' }
]

// Default system fields that can be toggled but not deleted
const SYSTEM_FIELDS = [
  { fieldName: 'name', label: 'Nome Completo', type: 'text', required: true, active: true },
  { fieldName: 'cpf', label: 'CPF', type: 'text', required: true, active: true },
  { fieldName: 'email', label: 'Email', type: 'email', required: false, active: false },
  { fieldName: 'phone', label: 'Telefone', type: 'tel', required: false, active: false }
]

export default function EventFieldsPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session, status } = useSession()
  const eventSlug = params?.slug as string

  const [event, setEvent] = useState<Event | null>(null)
  const [fields, setFields] = useState<CustomField[]>([])
  const [systemFields, setSystemFields] = useState(SYSTEM_FIELDS)
  const [editingField, setEditingField] = useState<CustomField | null>(null)
  const [showNewField, setShowNewField] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  // Check authentication
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

  // Load event and fields
  useEffect(() => {
    if (status === 'authenticated' && eventSlug) {
      loadEventAndFields()
    }
  }, [status, eventSlug])

  const loadEventAndFields = async () => {
    setLoading(true)
    try {
      // Load event info
      const eventResponse = await fetch(`/api/admin/eventos/${eventSlug}`)
      if (eventResponse.ok) {
        const eventData = await eventResponse.json()
        setEvent(eventData.event)

        // Load fields for this event
        const fieldsResponse = await fetch(`/api/admin/fields?eventId=${eventData.event.id}`)
        if (fieldsResponse.ok) {
          const data = await fieldsResponse.json()

          // Filter out system field configs and update system fields state
          const customFields: CustomField[] = []
          const systemConfigs: any[] = []

          for (const field of (data.fields || [])) {
            if (field.fieldName?.startsWith('_system_')) {
              systemConfigs.push(field)
            } else if (field.fieldName?.startsWith('_text_')) {
              continue
            } else {
              customFields.push(field)
            }
          }

          // Update system fields with saved configurations
          if (systemConfigs.length > 0) {
            const updatedSystemFields = SYSTEM_FIELDS.map(sysField => {
              const config = systemConfigs.find(c => c.fieldName === `_system_${sysField.fieldName}`)
              if (config) {
                return {
                  ...sysField,
                  required: config.required,
                  active: config.active
                }
              }
              return sysField
            })
            setSystemFields(updatedSystemFields)
          }

          setFields(customFields)
        }
      }
    } catch (error) {
      console.error('Failed to load event/fields:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveField = async (field: CustomField) => {
    try {
      if (!field.fieldName || !field.label) {
        alert('Nome do campo e rótulo são obrigatórios!')
        return
      }

      const method = field.id ? 'PUT' : 'POST'
      const response = await fetch('/api/admin/fields', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...field,
          eventId: event?.id
        })
      })

      const data = await response.json()

      if (response.ok) {
        // Sync with Stand table if field has limits
        if (field.validation?.hasLimits && field.options && event) {
          try {
            await fetch('/api/admin/sync-field-stands', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fieldName: field.fieldName,
                options: field.options,
                validation: field.validation,
                eventCode: event.code,
                eventId: event.id
              })
            })
          } catch (syncError) {
            console.error('Sync error:', syncError)
          }
        }

        setNotification({ type: 'success', message: 'Campo salvo com sucesso!' })
        setTimeout(() => setNotification(null), 3000)
        await loadEventAndFields()
        setEditingField(null)
        setShowNewField(false)
      } else {
        setNotification({ type: 'error', message: `Erro: ${data.error || 'Erro desconhecido'}` })
        setTimeout(() => setNotification(null), 5000)
      }
    } catch (error) {
      console.error('Failed to save field:', error)
      setNotification({ type: 'error', message: 'Erro ao salvar campo' })
      setTimeout(() => setNotification(null), 5000)
    }
  }

  const handleDeleteField = async (fieldId: string) => {
    if (!confirm('Tem certeza que deseja excluir este campo?')) return

    try {
      const response = await fetch(`/api/admin/fields?id=${fieldId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setNotification({ type: 'success', message: 'Campo excluído!' })
        setTimeout(() => setNotification(null), 3000)
        await loadEventAndFields()
      }
    } catch (error) {
      console.error('Failed to delete field:', error)
      alert('Erro ao excluir campo')
    }
  }

  const handleToggleActive = async (field: CustomField) => {
    try {
      const response = await fetch('/api/admin/fields', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...field,
          eventId: event?.id,
          active: !field.active
        })
      })

      if (response.ok) {
        await loadEventAndFields()
        setNotification({
          type: 'success',
          message: field.active ? 'Campo desativado' : 'Campo ativado'
        })
        setTimeout(() => setNotification(null), 3000)
      }
    } catch (error) {
      console.error('Failed to toggle field:', error)
    }
  }

  const handleToggleSystemField = async (fieldName: string, toggleType: 'required' | 'active') => {
    const field = systemFields.find(f => f.fieldName === fieldName)
    if (field) {
      const updatedFields = systemFields.map(f => {
        if (f.fieldName === fieldName) {
          if (toggleType === 'required') {
            return { ...f, required: !f.required }
          } else {
            return { ...f, active: !f.active }
          }
        }
        return f
      })
      setSystemFields(updatedFields)

      // Save to backend
      const updatedField = updatedFields.find(f => f.fieldName === fieldName)
      await fetch('/api/admin/system-fields', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldName,
          required: updatedField?.required,
          active: updatedField?.active,
          eventId: event?.id
        })
      })
    }
  }

  // Field Editor Component
  const FieldEditor = ({ field, onSave, onCancel }: { field: CustomField | null, onSave: (field: CustomField) => void, onCancel: () => void }) => {
    const initialField: CustomField = field ? {
      ...field,
      validation: {
        ...(field.validation || {}),
        hasLimits: field.validation?.hasLimits !== undefined ? field.validation.hasLimits : (field.type === 'select'),
        optionLimits: field.validation?.optionLimits || {},
        enableOCR: field.validation?.enableOCR || false,
        ocrType: field.validation?.ocrType || '',
        maxSize: field.validation?.maxSize || 5
      }
    } : {
      fieldName: '',
      label: '',
      type: 'text',
      required: false,
      placeholder: '',
      options: [],
      order: fields.length,
      active: true,
      validation: {
        hasLimits: false,
        optionLimits: {},
        enableOCR: false,
        ocrType: '',
        maxSize: 5
      }
    }

    const [localField, setLocalField] = useState<CustomField>(initialField)
    const [isSaving, setIsSaving] = useState(false)

    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-bold mb-4">
          {field?.id ? 'Editar Campo' : 'Novo Campo'}
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nome do Campo (interno) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={localField.fieldName}
              onChange={(e) => setLocalField({ ...localField, fieldName: e.target.value.toLowerCase().replace(/\s/g, '_') })}
              className={`w-full px-3 py-2 border rounded-lg ${!localField.fieldName ? 'border-red-300' : 'border-gray-300'}`}
              placeholder="ex: documento_rg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rótulo de Exibição <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={localField.label}
              onChange={(e) => setLocalField({ ...localField, label: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg ${!localField.label ? 'border-red-300' : 'border-gray-300'}`}
              placeholder="ex: RG (Carteira de Identidade)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de Campo
            </label>
            <select
              value={localField.type}
              onChange={(e) => {
                const newType = e.target.value
                const updates: CustomField = { ...localField, type: newType }

                if (newType === 'select') {
                  updates.validation = {
                    ...(localField.validation || {}),
                    hasLimits: true,
                    optionLimits: localField.validation?.optionLimits || {}
                  }
                }

                if (newType === 'file') {
                  updates.validation = {
                    ...(localField.validation || {}),
                    maxSize: localField.validation?.maxSize || 5,
                    enableOCR: localField.validation?.enableOCR || false,
                    ocrType: localField.validation?.ocrType || ''
                  }
                }

                setLocalField(updates)
              }}
              className="w-full px-3 py-2 border rounded-lg bg-white"
            >
              {FIELD_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Placeholder
            </label>
            <input
              type="text"
              value={localField.placeholder || ''}
              onChange={(e) => setLocalField({ ...localField, placeholder: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="Texto de ajuda"
            />
          </div>

          {/* File/Document Configuration */}
          {localField.type === 'file' && (
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                📁 Configurações do Documento/Arquivo
              </label>
              <div className="bg-blue-50 rounded-lg p-4 space-y-4">
                {/* Accepted file types */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Tipos de arquivo aceitos (separados por vírgula)
                  </label>
                  <input
                    type="text"
                    value={localField.options?.join(',') || ''}
                    onChange={(e) => setLocalField({
                      ...localField,
                      options: e.target.value.split(',').map(s => s.trim()).filter(s => s)
                    })}
                    className="w-full px-3 py-2 border rounded text-sm"
                    placeholder="Ex: .pdf,.jpg,.png,.doc,.docx"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Deixe vazio para aceitar qualquer tipo de arquivo
                  </p>
                </div>

                {/* Max file size */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Tamanho máximo (MB)
                  </label>
                  <input
                    type="number"
                    value={localField.validation?.maxSize || 5}
                    onChange={(e) => setLocalField({
                      ...localField,
                      validation: { ...localField.validation, maxSize: parseInt(e.target.value) || 5 }
                    })}
                    className="w-full px-3 py-2 border rounded text-sm"
                    min="1"
                    max="50"
                  />
                </div>

                {/* OCR Configuration */}
                <div className="bg-white rounded-lg p-4 border border-blue-200">
                  <div className="flex items-center space-x-2 mb-3">
                    <input
                      type="checkbox"
                      id="enableOCR"
                      checked={localField.validation?.enableOCR || false}
                      onChange={(e) => setLocalField({
                        ...localField,
                        validation: {
                          ...localField.validation,
                          enableOCR: e.target.checked,
                          ocrType: e.target.checked ? (localField.validation?.ocrType || 'all') : ''
                        }
                      })}
                      className="h-5 w-5 rounded"
                    />
                    <label htmlFor="enableOCR" className="text-sm font-medium text-gray-700">
                      🔍 Habilitar OCR (Extração automática de dados)
                    </label>
                  </div>

                  {localField.validation?.enableOCR && (
                    <div className="ml-7">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Tipo de extração OCR
                      </label>
                      <select
                        value={localField.validation?.ocrType || 'all'}
                        onChange={(e) => setLocalField({
                          ...localField,
                          validation: { ...localField.validation, ocrType: e.target.value }
                        })}
                        className="w-full px-3 py-2 border rounded text-sm bg-white"
                      >
                        {OCR_TYPES.filter(t => t.value !== '').map(type => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-2">
                        O sistema tentará extrair automaticamente os dados do documento enviado.
                        Isso pode ajudar a pré-preencher campos ou validar informações.
                      </p>
                    </div>
                  )}
                </div>

                <div className="bg-yellow-50 rounded p-3 border border-yellow-200">
                  <p className="text-xs text-yellow-800">
                    <strong>💡 Dica:</strong> Para documentos de identificação (RG, CNH, CPF),
                    habilite o OCR para extrair dados automaticamente e agilizar o cadastro.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Select options configuration */}
          {localField.type === 'select' && (
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Opções da Lista
              </label>

              <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localField.validation?.hasLimits || false}
                    onChange={(e) => {
                      const newValidation = { ...(localField.validation || {}), hasLimits: e.target.checked }
                      if (!e.target.checked) {
                        delete newValidation.optionLimits
                      } else {
                        newValidation.optionLimits = {}
                        localField.options?.forEach((opt) => {
                          newValidation.optionLimits![opt] = 3
                        })
                      }
                      setLocalField({ ...localField, validation: newValidation })
                    }}
                    className="rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    🔢 Controlar limite de registros por opção (para stands)
                  </span>
                </label>
              </div>

              <div className="space-y-2 mb-3">
                {localField.options && localField.options.length > 0 ? (
                  localField.options.map((option, index) => (
                    <div key={index} className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm text-gray-500 w-6">{index + 1}.</span>
                        <input
                          type="text"
                          value={option}
                          onChange={(e) => {
                            const oldOption = option
                            const newOptions = [...(localField.options || [])]
                            newOptions[index] = e.target.value

                            const newValidation = { ...(localField.validation || {}) }
                            if (newValidation.hasLimits && newValidation.optionLimits) {
                              const limit = newValidation.optionLimits[oldOption] || 3
                              delete newValidation.optionLimits[oldOption]
                              newValidation.optionLimits[e.target.value] = limit
                            }

                            setLocalField({ ...localField, options: newOptions, validation: newValidation })
                          }}
                          className="flex-1 px-3 py-2 border rounded text-sm"
                          placeholder="Digite o texto da opção"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newOptions = localField.options?.filter((_, i) => i !== index)
                            const newValidation = { ...(localField.validation || {}) }
                            if (newValidation.optionLimits) {
                              delete newValidation.optionLimits[option]
                            }
                            setLocalField({ ...localField, options: newOptions, validation: newValidation })
                          }}
                          className="text-red-500 hover:text-red-700 text-sm px-2 py-1"
                        >
                          ✕ Remover
                        </button>
                      </div>

                      {localField.validation?.hasLimits && (
                        <div className="ml-8 flex items-center gap-2">
                          <label className="text-xs text-gray-600 whitespace-nowrap">
                            Limite de registros:
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={localField.validation?.optionLimits?.[option] || 3}
                            onChange={(e) => {
                              const newValidation = { ...(localField.validation || {}) }
                              if (!newValidation.optionLimits) {
                                newValidation.optionLimits = {}
                              }
                              newValidation.optionLimits[option] = parseInt(e.target.value) || 3
                              setLocalField({ ...localField, validation: newValidation })
                            }}
                            className="w-24 px-2 py-1 border rounded text-sm"
                          />
                          <span className="text-xs text-gray-500">registros</span>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-gray-400 text-sm italic p-3 bg-gray-50 rounded">
                    Nenhuma opção adicionada ainda.
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  const newOptions = [...(localField.options || []), '']
                  const newValidation = { ...(localField.validation || {}) }
                  if (newValidation.hasLimits) {
                    if (!newValidation.optionLimits) {
                      newValidation.optionLimits = {}
                    }
                    newValidation.optionLimits[''] = 3
                  }
                  setLocalField({ ...localField, options: newOptions, validation: newValidation })
                }}
                className="w-full px-3 py-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 text-sm font-medium"
              >
                + Adicionar Nova Opção
              </button>
            </div>
          )}

          <div className="col-span-2 space-y-2">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={localField.required}
                onChange={(e) => setLocalField({ ...localField, required: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm font-medium text-gray-700">Campo Obrigatório</span>
            </label>

            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={localField.active !== false}
                onChange={(e) => setLocalField({ ...localField, active: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm font-medium text-gray-700">Campo Ativo</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={async () => {
              setIsSaving(true)
              await onSave(localField)
              setIsSaving(false)
            }}
            disabled={isSaving || !localField.fieldName || !localField.label}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Salvando...' : 'Salvar Campo'}
          </button>
        </div>
      </div>
    )
  }

  if (status === 'loading' || loading) {
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
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Notification */}
        {notification && (
          <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg ${
            notification.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
          }`}>
            <div className="flex items-center space-x-2">
              <span>{notification.type === 'success' ? '✅' : '❌'}</span>
              <span>{notification.message}</span>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 mb-2">
                🔧 Gerenciar Campos e Documentos
              </h1>
              <p className="text-gray-600">
                {event?.name}
              </p>
              <p className="text-sm text-blue-600 mt-1">
                Configure os campos do formulário e documentos solicitados para este evento
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowNewField(true)}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
              >
                ➕ Adicionar Campo
              </button>
              <button
                onClick={() => router.push(`/admin/eventos/${eventSlug}`)}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                ← Voltar
              </button>
            </div>
          </div>
        </div>

        {/* System Fields */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            📋 Campos do Sistema
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Estes campos fazem parte do sistema e podem ser ativados/desativados
          </p>
          <div className="space-y-3">
            {systemFields.map((field) => (
              <div key={field.fieldName} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <h3 className="font-semibold">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </h3>
                  <p className="text-sm text-gray-500">
                    Campo: {field.fieldName} | Tipo: {field.type}
                  </p>
                </div>
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={() => handleToggleSystemField(field.fieldName, 'required')}
                      className="rounded h-4 w-4"
                    />
                    <span className="text-sm">Obrigatório</span>
                  </label>

                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={field.active}
                      onChange={() => handleToggleSystemField(field.fieldName, 'active')}
                      className="rounded h-4 w-4"
                    />
                    <span className="text-sm">Ativo</span>
                  </label>

                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    field.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {field.active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Custom Fields */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            ⚙️ Campos Personalizados e Documentos
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Adicione campos de texto, seleção, ou documentos (arquivos com OCR)
          </p>

          {fields.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">Nenhum campo personalizado criado ainda para este evento</p>
              <button
                onClick={() => setShowNewField(true)}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Criar primeiro campo →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {fields.sort((a, b) => a.order - b.order).map((field) => (
                <div key={field.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </h3>
                      {field.type === 'file' && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                          📎 Arquivo
                        </span>
                      )}
                      {field.type === 'file' && field.validation?.enableOCR && (
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                          🔍 OCR
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      Campo: {field.fieldName} | Tipo: {FIELD_TYPES.find(t => t.value === field.type)?.label || field.type}
                    </p>
                    {field.type === 'file' && field.validation?.enableOCR && (
                      <p className="text-xs text-purple-600 mt-1">
                        OCR: {OCR_TYPES.find(t => t.value === field.validation?.ocrType)?.label || 'Habilitado'}
                      </p>
                    )}
                    {field.options && field.options.length > 0 && field.type !== 'file' && (
                      <p className="text-xs text-gray-400 mt-1">
                        Opções: {field.options.join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    {field.required && (
                      <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
                        Obrigatório
                      </span>
                    )}
                    <button
                      onClick={() => handleToggleActive(field)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                        field.active
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                      }`}
                    >
                      {field.active ? '✓ Ativo' : '✕ Inativo'}
                    </button>
                    <button
                      onClick={() => setEditingField(field)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      ✏️ Editar
                    </button>
                    <button
                      onClick={() => handleDeleteField(field.id!)}
                      className="text-red-600 hover:text-red-800"
                    >
                      🗑️ Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Add Document Templates */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            📄 Adicionar Documento Rápido
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Clique em um modelo para adicionar um campo de documento pré-configurado
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'RG', fieldName: 'documento_rg', ocrType: 'rg' },
              { label: 'CPF', fieldName: 'documento_cpf', ocrType: 'cpf' },
              { label: 'CNH', fieldName: 'documento_cnh', ocrType: 'cnh' },
              { label: 'Comprovante de Residência', fieldName: 'comprovante_residencia', ocrType: '' },
              { label: 'Foto 3x4', fieldName: 'foto_3x4', ocrType: '' },
            ].map((template) => (
              <button
                key={template.fieldName}
                onClick={() => {
                  const existingField = fields.find(f => f.fieldName === template.fieldName)
                  if (existingField) {
                    alert('Este documento já foi adicionado!')
                    return
                  }
                  setEditingField({
                    fieldName: template.fieldName,
                    label: template.label,
                    type: 'file',
                    required: false,
                    options: ['.jpg', '.jpeg', '.png', '.pdf'],
                    order: fields.length,
                    active: true,
                    validation: {
                      maxSize: 5,
                      enableOCR: !!template.ocrType,
                      ocrType: template.ocrType
                    }
                  })
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
              >
                + {template.label}
              </button>
            ))}
          </div>
        </div>

        {/* Field Editor Modal */}
        {(showNewField || editingField) && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <FieldEditor
                field={editingField}
                onSave={handleSaveField}
                onCancel={() => {
                  setEditingField(null)
                  setShowNewField(false)
                }}
              />
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-blue-50 rounded-lg p-4">
          <h3 className="font-semibold text-blue-800 mb-2">💡 Dicas</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Use o tipo <strong>"Anexar Arquivo/Documento"</strong> para solicitar documentos</li>
            <li>• Habilite <strong>OCR</strong> para extrair dados automaticamente de documentos de identificação</li>
            <li>• Marque campos como <strong>Obrigatório</strong> para que o usuário não possa prosseguir sem preenchê-los</li>
            <li>• Campos <strong>Inativos</strong> não aparecem no formulário de cadastro</li>
            <li>• As configurações deste evento <strong>não afetam</strong> outros eventos</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
