'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface CustomField {
  id?: string
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

// Default system fields that can be toggled but not deleted
const SYSTEM_FIELDS = [
  { fieldName: 'name', label: 'Nome Completo', type: 'text', required: true, active: true },
  { fieldName: 'cpf', label: 'CPF', type: 'text', required: true, active: true },
  { fieldName: 'email', label: 'Email', type: 'email', required: false, active: false },
  { fieldName: 'phone', label: 'Telefone', type: 'tel', required: false, active: false }
]

export default function FieldsManagerPage() {
  const [fields, setFields] = useState<CustomField[]>([])
  const [systemFields, setSystemFields] = useState(SYSTEM_FIELDS)
  const [editingField, setEditingField] = useState<CustomField | null>(null)
  const [showNewField, setShowNewField] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [showTextConfig, setShowTextConfig] = useState(false)
  const [textConfig, setTextConfig] = useState({
    successText: '',
    instructionsText: ''
  })
  const router = useRouter()

  // Check authentication
  useEffect(() => {
    checkAuth()
  }, [])

  // Load custom fields
  useEffect(() => {
    if (isAuthenticated) {
      loadFields()
      loadTextConfig()
    }
  }, [isAuthenticated])

  const checkAuth = async () => {
    const token = sessionStorage.getItem('adminFieldsAuth')
    
    if (!token) {
      router.push('/admin/fields/login')
      return
    }

    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'verify' })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.valid) {
          setIsAuthenticated(true)
        } else {
          sessionStorage.removeItem('adminFieldsAuth')
          router.push('/admin/fields/login')
        }
      } else {
        sessionStorage.removeItem('adminFieldsAuth')
        router.push('/admin/fields/login')
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      router.push('/admin/fields/login')
    }
  }

  const loadFields = async () => {
    setLoading(true)
    try {
      const token = sessionStorage.getItem('adminFieldsAuth')
      const response = await fetch('/api/admin/fields', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        
        // Filter out system field configs and update system fields state
        const customFields = []
        const systemConfigs = []
        
        for (const field of (data.fields || [])) {
          if (field.fieldName?.startsWith('_system_')) {
            systemConfigs.push(field)
          } else if (field.fieldName?.startsWith('_text_')) {
            // Skip text configuration fields as they have their own UI
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
    } catch (error) {
      console.error('Failed to load fields:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveField = async (field: CustomField) => {
    try {
      console.log('Saving field:', field)
      
      // Validation
      if (!field.fieldName || !field.label) {
        alert('Nome do campo e rótulo são obrigatórios!')
        return
      }
      
      const method = field.id ? 'PUT' : 'POST'
      const token = sessionStorage.getItem('adminFieldsAuth')
      const response = await fetch('/api/admin/fields', {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(field)
      })

      const data = await response.json()
      console.log('Response:', response.status, data)

      if (response.ok) {
        setNotification({ type: 'success', message: 'Campo salvo com sucesso!' })
        setTimeout(() => setNotification(null), 3000)
        await loadFields()
        setEditingField(null)
        setShowNewField(false)
      } else {
        setNotification({ type: 'error', message: `Erro: ${data.error || 'Erro desconhecido'}` })
        setTimeout(() => setNotification(null), 5000)
      }
    } catch (error) {
      console.error('Failed to save field:', error)
      setNotification({ type: 'error', message: 'Erro ao salvar campo. Verifique o console.' })
      setTimeout(() => setNotification(null), 5000)
    }
  }

  const handleDeleteField = async (fieldId: string) => {
    if (!confirm('Tem certeza que deseja excluir este campo?')) return

    try {
      const token = sessionStorage.getItem('adminFieldsAuth')
      const response = await fetch(`/api/admin/fields?id=${fieldId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        await loadFields()
      }
    } catch (error) {
      console.error('Failed to delete field:', error)
      alert('Erro ao excluir campo')
    }
  }

  const handleToggleSystemField = async (fieldName: string, toggleType: 'required' | 'active') => {
    // Toggle visibility or required status of system fields
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
          active: updatedField?.active 
        })
      })
    }
  }

  const loadTextConfig = async () => {
    try {
      const token = sessionStorage.getItem('adminFieldsAuth')
      const response = await fetch('/api/admin/text-config', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        setTextConfig(data)
      }
    } catch (error) {
      console.error('Failed to load text config:', error)
    }
  }

  const saveTextConfig = async () => {
    try {
      const token = sessionStorage.getItem('adminFieldsAuth')
      const response = await fetch('/api/admin/text-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(textConfig)
      })
      
      if (response.ok) {
        setNotification({ type: 'success', message: 'Textos salvos com sucesso!' })
        setTimeout(() => setNotification(null), 3000)
        setShowTextConfig(false)
      } else {
        setNotification({ type: 'error', message: 'Erro ao salvar textos' })
        setTimeout(() => setNotification(null), 5000)
      }
    } catch (error) {
      console.error('Failed to save text config:', error)
      setNotification({ type: 'error', message: 'Erro ao salvar textos' })
      setTimeout(() => setNotification(null), 5000)
    }
  }

  const FieldEditor = ({ field, onSave, onCancel }: any) => {
    const [localField, setLocalField] = useState<CustomField>(
      field || {
        fieldName: '',
        label: '',
        type: 'text',
        required: false,
        placeholder: '',
        options: [],
        order: fields.length,
        active: true
      }
    )
    const [isSaving, setIsSaving] = useState(false)

    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-bold mb-4">
          {field?.id ? 'Editar Campo' : 'Novo Campo'}
        </h3>
        
        {(!localField.fieldName || !localField.label) && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-yellow-800">
              ⚠️ Preencha os campos obrigatórios (Nome e Rótulo) para habilitar o botão de salvar
            </p>
          </div>
        )}

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
              placeholder="ex: telefone_comercial"
              required
            />
            {!localField.fieldName && (
              <p className="text-red-500 text-xs mt-1">Campo obrigatório</p>
            )}
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
              placeholder="ex: Telefone Comercial"
              required
            />
            {!localField.label && (
              <p className="text-red-500 text-xs mt-1">Campo obrigatório</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de Campo
            </label>
            <select
              value={localField.type}
              onChange={(e) => setLocalField({ ...localField, type: e.target.value })}
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
              value={localField.placeholder}
              onChange={(e) => setLocalField({ ...localField, placeholder: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="Texto de ajuda"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Campo Obrigatório
            </label>
            <div className="flex items-center pt-2">
              <input
                type="checkbox"
                id="field-required"
                checked={localField.required || false}
                onChange={(e) => setLocalField({ ...localField, required: e.target.checked })}
                className="h-5 w-5 text-mega-600 rounded focus:ring-mega-500"
              />
              <label htmlFor="field-required" className="ml-2 text-gray-700">
                Marcar como obrigatório
              </label>
            </div>
          </div>

          {localField.type === 'file' && (
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                📁 Configurações do Arquivo
              </label>
              <div className="bg-blue-50 rounded-lg p-4 space-y-3">
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
                  <p className="text-xs text-gray-500 mt-1">
                    Tamanho máximo do arquivo em megabytes (padrão: 5MB)
                  </p>
                </div>

                <div className="bg-white rounded p-3">
                  <p className="text-xs text-gray-600">
                    <strong>ℹ️ Nota:</strong> Os arquivos enviados serão armazenados de forma segura 
                    e poderão ser acessados apenas pelo painel administrativo para validação.
                  </p>
                </div>
              </div>
            </div>
          )}

          {localField.type === 'select' && (
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Opções da Lista
              </label>
              
              {/* Lista de opções existentes */}
              <div className="space-y-2 mb-3">
                {localField.options && localField.options.length > 0 ? (
                  localField.options.map((option, index) => (
                    <div key={index} className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                      <span className="text-sm text-gray-500 w-6">{index + 1}.</span>
                      <input
                        type="text"
                        value={option}
                        onChange={(e) => {
                          const newOptions = [...(localField.options || [])]
                          newOptions[index] = e.target.value
                          setLocalField({ ...localField, options: newOptions })
                        }}
                        className="flex-1 px-2 py-1 border rounded text-sm"
                        placeholder="Digite o texto da opção"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const newOptions = localField.options?.filter((_, i) => i !== index)
                          setLocalField({ ...localField, options: newOptions })
                        }}
                        className="text-red-500 hover:text-red-700 text-sm px-2"
                      >
                        ✕ Remover
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-gray-400 text-sm italic p-3 bg-gray-50 rounded">
                    Nenhuma opção adicionada ainda. Use o botão abaixo para adicionar.
                  </div>
                )}
              </div>

              {/* Botão para adicionar nova opção */}
              <button
                type="button"
                onClick={() => {
                  const newOptions = [...(localField.options || []), '']
                  setLocalField({ ...localField, options: newOptions })
                }}
                className="w-full px-3 py-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 text-sm font-medium"
              >
                + Adicionar Nova Opção
              </button>

              {/* Exemplos rápidos */}
              {(!localField.options || localField.options.length === 0) && (
                <div className="mt-2 flex gap-2 flex-wrap">
                  <span className="text-xs text-gray-500">Exemplos rápidos:</span>
                  <button
                    type="button"
                    onClick={() => setLocalField({ 
                      ...localField, 
                      options: ['Sim', 'Não', 'Talvez'] 
                    })}
                    className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                  >
                    Sim/Não/Talvez
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocalField({ 
                      ...localField, 
                      options: ['Manhã', 'Tarde', 'Noite'] 
                    })}
                    className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                  >
                    Períodos
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocalField({ 
                      ...localField, 
                      options: ['Pequeno', 'Médio', 'Grande'] 
                    })}
                    className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                  >
                    Tamanhos
                  </button>
                </div>
              )}

              {/* Dica de uso */}
              <p className="text-xs text-gray-500 mt-2">
                💡 Dica: Adicione as opções que aparecerão no menu dropdown. 
                Você pode editar o texto diretamente ou remover opções não desejadas.
              </p>
            </div>
          )}

          <div className="col-span-2">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={localField.required}
                onChange={(e) => setLocalField({ ...localField, required: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm font-medium text-gray-700">Campo Obrigatório</span>
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
            className="px-4 py-2 bg-mega-500 text-white rounded-lg hover:bg-mega-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Salvando...' : 'Salvar Campo'}
          </button>
        </div>
      </div>
    )
  }

  // Show loading screen while checking auth
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-500">Verificando autenticação...</p>
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
                🔧 Gerenciar Campos do Formulário
              </h1>
              <p className="text-gray-600">
                Customize os campos de coleta de dados para seu evento
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowTextConfig(true)}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                title="Configurar textos do sistema"
              >
                📝 Configurar Textos
              </button>
              <button
                onClick={async () => {
                  const token = sessionStorage.getItem('adminFieldsAuth')
                  try {
                    const response = await fetch('/api/admin/update-required', {
                      method: 'POST',
                      headers: { 
                        'Authorization': `Bearer ${token}`
                      }
                    })
                    if (response.ok) {
                      const data = await response.json()
                      setNotification({ 
                        type: 'success', 
                        message: `${data.count} campos marcados como obrigatórios!` 
                      })
                      setTimeout(() => setNotification(null), 3000)
                      await loadFields()
                    }
                  } catch (error) {
                    console.error('Error updating fields:', error)
                  }
                }}
                className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600"
                title="Marcar todos os campos como obrigatórios"
              >
                ⚠️ Todos Obrigatórios
              </button>
              <button
                onClick={() => setShowNewField(true)}
                className="px-4 py-2 bg-mega-500 text-white rounded-lg hover:bg-mega-600"
              >
                ➕ Adicionar Campo
              </button>
              <button
                onClick={() => {
                  sessionStorage.removeItem('adminFieldsAuth')
                  router.push('/admin/fields/login')
                }}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                🚪 Sair
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
                      className="rounded h-4 w-4 text-mega-600"
                    />
                    <span className="text-sm">Obrigatório</span>
                  </label>
                  
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={field.active}
                      onChange={() => handleToggleSystemField(field.fieldName, 'active')}
                      className="rounded h-4 w-4 text-mega-600"
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
            ⚙️ Campos Personalizados
          </h2>
          {loading ? (
            <div className="text-center py-8">
              <div className="spinner mx-auto mb-4"></div>
              <p className="text-gray-500">Carregando campos...</p>
            </div>
          ) : fields.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">Nenhum campo personalizado criado ainda</p>
              <button
                onClick={() => setShowNewField(true)}
                className="text-mega-600 hover:text-mega-700 font-medium"
              >
                Criar primeiro campo →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {fields.sort((a, b) => a.order - b.order).map((field) => (
                <div key={field.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex-1">
                    <h3 className="font-semibold">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </h3>
                    <p className="text-sm text-gray-500">
                      Campo: {field.fieldName} | Tipo: {field.type}
                    </p>
                    {field.options && field.options.length > 0 && (
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
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      field.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {field.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Field Editor Modal */}
        {(showNewField || editingField) && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="max-w-2xl w-full">
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

        {/* Text Configuration Modal */}
        {showTextConfig && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-800">
                  📝 Configurar Textos do Sistema
                </h3>
                <button
                  onClick={() => setShowTextConfig(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-6">
                {/* Success Text Configuration */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ✅ Texto de "Acesso Liberado" (Tela de Sucesso)
                  </label>
                  <textarea
                    value={textConfig.successText}
                    onChange={(e) => setTextConfig({ ...textConfig, successText: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mega-500"
                    rows={6}
                    placeholder="Digite o texto que aparecerá na tela de sucesso após o cadastro..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Este texto será exibido quando o cadastro for concluído com sucesso.
                    Você pode usar quebras de linha para melhor formatação.
                  </p>
                </div>

                {/* Instructions Text Configuration */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    📱 Texto de "Como Usar" (Tela de Instruções)
                  </label>
                  <textarea
                    value={textConfig.instructionsText}
                    onChange={(e) => setTextConfig({ ...textConfig, instructionsText: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mega-500"
                    rows={8}
                    placeholder="Digite as instruções que aparecerão na tela inicial..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Este texto será exibido na tela inicial para orientar os usuários sobre como usar o sistema.
                    Use formatação clara e numeração para os passos.
                  </p>
                </div>

                {/* Preview Section */}
                <div className="border-t pt-4">
                  <h4 className="font-semibold text-gray-800 mb-3">👁️ Pré-visualização</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h5 className="font-medium text-gray-700 mb-2">Tela de Sucesso:</h5>
                      <div className="bg-white rounded p-3 border border-gray-200">
                        <pre className="whitespace-pre-wrap text-sm text-gray-600">
                          {textConfig.successText || 'Texto vazio...'}
                        </pre>
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h5 className="font-medium text-gray-700 mb-2">Tela de Instruções:</h5>
                      <div className="bg-white rounded p-3 border border-gray-200">
                        <pre className="whitespace-pre-wrap text-sm text-gray-600">
                          {textConfig.instructionsText || 'Texto vazio...'}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowTextConfig(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveTextConfig}
                  className="px-4 py-2 bg-mega-500 text-white rounded-lg hover:bg-mega-600"
                >
                  💾 Salvar Textos
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Back Button */}
        <div className="text-center mt-8">
          <a
            href="/admin"
            className="inline-flex items-center px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
          >
            ← Voltar para Admin
          </a>
        </div>
      </div>
    </div>
  )
}