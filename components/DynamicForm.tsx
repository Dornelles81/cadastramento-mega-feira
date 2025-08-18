'use client'

import { useState, useEffect } from 'react'
import DocumentField from './DocumentField'

interface FormField {
  fieldName: string
  label: string
  type: string
  required: boolean
  placeholder?: string
  options?: string[]
  validation?: any
}

interface DocumentFieldConfig {
  documentType: string
  label: string
  description?: string
  required: boolean
  enableOCR: boolean
  acceptedFormats?: any
  maxSizeMB: number
  order: number
}

interface DynamicFormProps {
  onSubmit: (data: any) => void
  onBack?: () => void
  eventCode?: string
  initialData?: any
}

export default function DynamicForm({ onSubmit, onBack, eventCode, initialData }: DynamicFormProps) {
  const [fields, setFields] = useState<FormField[]>([])
  const [documentFields, setDocumentFields] = useState<DocumentFieldConfig[]>([])
  const [formData, setFormData] = useState<any>(initialData || {})
  const [documentData, setDocumentData] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<any>({})
  const [uploadedFiles, setUploadedFiles] = useState<any>({})

  useEffect(() => {
    loadFormFields()
    loadDocumentFields()
  }, [eventCode])

  useEffect(() => {
    if (initialData) {
      setFormData(prev => ({ ...prev, ...initialData }))
    }
  }, [initialData])

  const loadDocumentFields = async () => {
    try {
      const response = await fetch(`/api/public/document-fields${eventCode ? `?eventCode=${eventCode}` : ''}`)
      if (response.ok) {
        const data = await response.json()
        console.log('📄 Document fields loaded:', data.documents)
        setDocumentFields(data.documents || [])
      }
    } catch (error) {
      console.error('Failed to load document fields:', error)
      setDocumentFields([])
    }
  }

  const loadFormFields = async () => {
    try {
      console.log('🔄 Loading form fields...')
      
      // Default fields as fallback
      const defaultFields: FormField[] = [
        {
          fieldName: 'name',
          label: 'Nome Completo',
          type: 'text',
          required: true,
          placeholder: 'Digite seu nome completo'
        },
        {
          fieldName: 'cpf',
          label: 'CPF',
          type: 'text',
          required: true,
          placeholder: '000.000.000-00'
        },
        {
          fieldName: 'email',
          label: 'Email',
          type: 'email',
          required: false,
          placeholder: 'seu@email.com'
        },
        {
          fieldName: 'phone',
          label: 'Telefone',
          type: 'tel',
          required: true,
          placeholder: '(11) 99999-9999'
        }
      ]
      
      try {
        const response = await fetch(`/api/form-fields${eventCode ? `?eventCode=${eventCode}` : ''}`)
        
        if (response.ok) {
          const data = await response.json()
          console.log('📋 API Response:', data)
          
          // Use API fields if available, otherwise use defaults
          const rawFields = (data.fields && Array.isArray(data.fields) && data.fields.length > 0) 
            ? data.fields 
            : defaultFields
          
          // Filter out text configuration fields and internal system fields
          const fieldsArray = rawFields.filter((field: FormField) => 
            !field.fieldName?.startsWith('_text_') && 
            !field.fieldName?.startsWith('_system_')
          )
          
          console.log('📋 Filtered fields:', rawFields.length, '→', fieldsArray.length)
          setFields(fieldsArray)
          
          // Initialize form data with default values
          const initialData: any = {}
          fieldsArray.forEach((field: FormField) => {
            if (field.type === 'checkbox') {
              initialData[field.fieldName] = false
            } else {
              initialData[field.fieldName] = ''
            }
          })
          setFormData(initialData)
          console.log('✅ Form initialized with:', fieldsArray.length, 'fields')
        } else {
          console.error('❌ Failed to fetch fields, using defaults. Status:', response.status)
          // Filter default fields too
          const filteredDefaults = defaultFields.filter((field: FormField) => 
            !field.fieldName?.startsWith('_text_') && 
            !field.fieldName?.startsWith('_system_')
          )
          setFields(filteredDefaults)
        }
      } catch (fetchError) {
        console.error('Failed to fetch, using default fields:', fetchError)
        // Filter default fields in catch too
        const filteredDefaults = defaultFields.filter((field: FormField) => 
          !field.fieldName?.startsWith('_text_') && 
          !field.fieldName?.startsWith('_system_')
        )
        setFields(filteredDefaults)
        
        // Initialize with filtered defaults
        const initialData: any = {}
        filteredDefaults.forEach((field: FormField) => {
          initialData[field.fieldName] = field.type === 'checkbox' ? false : ''
        })
        setFormData(initialData)
      }
    } catch (error) {
      console.error('Critical error in loadFormFields:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFieldChange = (fieldName: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [fieldName]: value }))
    // Clear error for this field when user starts typing
    setErrors((prev: any) => ({ ...prev, [fieldName]: '' }))
  }

  const handleFileUpload = async (fieldName: string, file: File, field: FormField) => {
    try {
      // Check file size
      const maxSize = field.validation?.maxSize || 5
      if (file.size > maxSize * 1024 * 1024) {
        setErrors((prev: any) => ({ 
          ...prev, 
          [fieldName]: `Arquivo muito grande. Máximo: ${maxSize}MB` 
        }))
        return
      }

      // Check file type if specified
      if (field.options && field.options.length > 0) {
        const extension = '.' + file.name.split('.').pop()?.toLowerCase()
        const allowedTypes = field.options.map(opt => opt.toLowerCase())
        if (!allowedTypes.some(type => extension.includes(type))) {
          setErrors((prev: any) => ({ 
            ...prev, 
            [fieldName]: `Tipo de arquivo não permitido. Aceitos: ${field.options.join(', ')}` 
          }))
          return
        }
      }

      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const data = await response.json()
        setUploadedFiles((prev: any) => ({ ...prev, [fieldName]: data.file }))
        handleFieldChange(fieldName, data.file.path)
        setErrors((prev: any) => ({ ...prev, [fieldName]: '' }))
      } else {
        setErrors((prev: any) => ({ 
          ...prev, 
          [fieldName]: 'Erro ao fazer upload do arquivo' 
        }))
      }
    } catch (error) {
      console.error('Upload error:', error)
      setErrors((prev: any) => ({ 
        ...prev, 
        [fieldName]: 'Erro ao fazer upload do arquivo' 
      }))
    }
  }

  const validateForm = () => {
    const newErrors: any = {}
    let isValid = true

    fields.forEach(field => {
      if (field.required && !formData[field.fieldName]) {
        newErrors[field.fieldName] = `${field.label} é obrigatório`
        isValid = false
      }

      // Special validations
      if (field.fieldName === 'cpf' && formData[field.fieldName]) {
        const cpf = formData[field.fieldName].replace(/\D/g, '')
        if (cpf.length !== 11) {
          newErrors[field.fieldName] = 'CPF inválido'
          isValid = false
        }
      }

      if (field.type === 'email' && formData[field.fieldName]) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(formData[field.fieldName])) {
          newErrors[field.fieldName] = 'Email inválido'
          isValid = false
        }
      }
    })

    setErrors(newErrors)
    return isValid
  }

  const handleDocumentChange = (documentType: string, data: any) => {
    setDocumentData((prev: any) => ({ 
      ...prev, 
      [documentType]: data 
    }))
  }

  const handleOCRExtract = (extractedData: any) => {
    // Auto-fill form fields with OCR data
    if (extractedData.name) {
      setFormData((prev: any) => ({ ...prev, name: extractedData.name }))
    }
    if (extractedData.cpf) {
      setFormData((prev: any) => ({ ...prev, cpf: extractedData.cpf }))
    }
    // Add more fields as needed
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validateForm()) {
      // Combine form data with document data
      const completeData = {
        ...formData,
        documents: documentData
      }
      onSubmit(completeData)
    }
  }

  const renderField = (field: FormField) => {
    switch (field.type) {
      case 'select':
        return (
          <select
            name={field.fieldName}
            value={formData[field.fieldName]}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            required={field.required}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-mega-500 focus:border-mega-500 bg-white"
          >
            <option value="">Selecione...</option>
            {field.options?.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        )

      case 'textarea':
        return (
          <textarea
            name={field.fieldName}
            value={formData[field.fieldName]}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            required={field.required}
            placeholder={field.placeholder}
            rows={4}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-mega-500 focus:border-mega-500"
          />
        )

      case 'checkbox':
        return (
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              name={field.fieldName}
              checked={formData[field.fieldName]}
              onChange={(e) => handleFieldChange(field.fieldName, e.target.checked)}
              className="h-5 w-5 text-mega-600 rounded"
            />
            <span className="text-gray-700">{field.placeholder || 'Marcar'}</span>
          </label>
        )

      case 'tel':
        return (
          <input
            type="tel"
            name={field.fieldName}
            value={formData[field.fieldName]}
            onChange={(e) => {
              let value = e.target.value.replace(/\D/g, '')
              if (value.length <= 11) {
                value = value.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
              }
              handleFieldChange(field.fieldName, value)
            }}
            required={field.required}
            placeholder={field.placeholder}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-mega-500 focus:border-mega-500"
          />
        )

      case 'file':
        return (
          <div>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-mega-500 transition-colors">
              <input
                type="file"
                id={field.fieldName}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    handleFileUpload(field.fieldName, file, field)
                  }
                }}
                accept={field.options?.join(',')}
                className="hidden"
              />
              <label 
                htmlFor={field.fieldName}
                className="cursor-pointer block text-center"
              >
                {uploadedFiles[field.fieldName] ? (
                  <div className="space-y-2">
                    <div className="text-green-600 text-2xl">✅</div>
                    <p className="text-sm font-medium text-gray-700">
                      {uploadedFiles[field.fieldName].originalName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(uploadedFiles[field.fieldName].size / 1024).toFixed(2)} KB
                    </p>
                    <p className="text-xs text-mega-600 font-medium">
                      Clique para trocar o arquivo
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-gray-400 text-3xl">📎</div>
                    <p className="text-sm font-medium text-gray-700">
                      Clique para anexar arquivo
                    </p>
                    {field.options && field.options.length > 0 && (
                      <p className="text-xs text-gray-500">
                        Aceitos: {field.options.join(', ')}
                      </p>
                    )}
                    {field.validation?.maxSize && (
                      <p className="text-xs text-gray-500">
                        Máximo: {field.validation.maxSize}MB
                      </p>
                    )}
                  </div>
                )}
              </label>
            </div>
          </div>
        )

      case 'text':
        if (field.fieldName === 'cpf') {
          return (
            <input
              type="text"
              name={field.fieldName}
              value={formData[field.fieldName]}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '')
                const formatted = value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
                handleFieldChange(field.fieldName, formatted)
              }}
              required={field.required}
              placeholder={field.placeholder}
              maxLength={14}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-mega-500 focus:border-mega-500"
            />
          )
        }
        // fallthrough to default

      default:
        return (
          <input
            type={field.type}
            name={field.fieldName}
            value={formData[field.fieldName]}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            required={field.required}
            placeholder={field.placeholder}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-mega-500 focus:border-mega-500"
          />
        )
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg p-6 shadow-sm">
        <div className="text-center py-8">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-500">Carregando formulário...</p>
        </div>
      </div>
    )
  }

  console.log('🎨 Rendering form with fields:', fields.length, 'fields')
  
  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg p-6 shadow-sm space-y-4">
      {fields.length === 0 && documentFields.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">Nenhum campo disponível no momento.</p>
          <p className="text-sm text-gray-400 mt-2">Verifique a configuração dos campos no painel administrativo.</p>
        </div>
      ) : (
        <>
          {/* Render text fields */}
          {fields.map((field) => {
            console.log('Rendering field:', field.fieldName, field.type)
            return (
              <div key={field.fieldName}>
                {field.type !== 'checkbox' && (
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {field.label} {field.required && '*'}
                  </label>
                )}
                {renderField(field)}
                {errors[field.fieldName] && (
                  <p className="text-red-500 text-sm mt-1">{errors[field.fieldName]}</p>
                )}
              </div>
            )
          })}
          
          {/* Render document fields */}
          {documentFields.length > 0 && (
            <>
              {documentFields.length > 0 && fields.length > 0 && (
                <div className="border-t pt-4 mt-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    📄 Documentos
                  </h3>
                </div>
              )}
              
              {documentFields.map((docField) => (
                <div key={docField.documentType}>
                  <DocumentField
                    documentType={docField.documentType}
                    label={docField.label}
                    description={docField.description}
                    required={docField.required}
                    enableOCR={docField.enableOCR}
                    acceptedFormats={docField.acceptedFormats}
                    maxSizeMB={docField.maxSizeMB}
                    value={documentData[docField.documentType]}
                    onChange={(data) => handleDocumentChange(docField.documentType, data)}
                    onOCRExtract={handleOCRExtract}
                  />
                </div>
              ))}
            </>
          )}
        </>
      )}

      <div className="pt-4 space-y-3">
        <button
          type="submit"
          className="w-full py-4 bg-mega-500 text-white rounded-lg font-semibold hover:bg-mega-600 transition-colors"
        >
          Continuar →
        </button>

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="w-full py-4 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
          >
            ← Voltar
          </button>
        )}
      </div>
    </form>
  )
}