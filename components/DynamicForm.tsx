'use client'

import { useState, useEffect } from 'react'
import DocumentField from './DocumentField'
import FileField from './FileField'

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

interface Stand {
  id: string
  name: string
  code: string
  description?: string
  location?: string
  maxRegistrations: number
  currentCount: number
  availableSlots: number
}

export default function DynamicForm({ onSubmit, onBack, eventCode, initialData }: DynamicFormProps) {
  const [fields, setFields] = useState<FormField[]>([])
  const [documentFields, setDocumentFields] = useState<DocumentFieldConfig[]>([])
  const [formData, setFormData] = useState<any>(initialData || {})
  const [documentData, setDocumentData] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<any>({})
  const [uploadedFiles, setUploadedFiles] = useState<any>({})
  const [stands, setStands] = useState<Stand[]>([])
  const [loadingStands, setLoadingStands] = useState(true)

  useEffect(() => {
    loadFormFields()
    loadDocumentFields()
    loadStands()
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

  const loadStands = async () => {
    try {
      setLoadingStands(true)
      const response = await fetch(`/api/public/stands${eventCode ? `?eventCode=${eventCode}` : ''}`)
      if (response.ok) {
        const data = await response.json()
        console.log('🏪 Stands loaded:', data.stands)
        setStands(data.stands || [])
      } else {
        setStands([])
      }
    } catch (error) {
      console.error('Failed to load stands:', error)
      setStands([])
    } finally {
      setLoadingStands(false)
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
          
          // Initialize form data with default values, preserving initialData
          const defaultValues: any = {}
          fieldsArray.forEach((field: FormField) => {
            if (field.type === 'checkbox') {
              defaultValues[field.fieldName] = false
            } else {
              defaultValues[field.fieldName] = ''
            }
          })
          setFormData((prev: any) => ({ ...defaultValues, ...prev }))
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

        // Initialize with filtered defaults, preserving initialData
        const defaultValues: any = {}
        filteredDefaults.forEach((field: FormField) => {
          defaultValues[field.fieldName] = field.type === 'checkbox' ? false : ''
        })
        setFormData((prev: any) => ({ ...defaultValues, ...prev }))
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

    // Validate stand selection if stands are available
    if (stands.length > 0 && !formData.standCode && !formData.estande) {
      newErrors.standCode = 'Seleção de stand é obrigatória'
      isValid = false
    }

    fields.forEach(field => {
      // Skip estande field as it's validated above
      if (field.fieldName.toLowerCase() === 'estande') {
        return
      }

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
            className="w-full px-4 py-3 border border-white/30 rounded-lg text-base focus:ring-2 focus:ring-primary focus:border-primary bg-white text-gray-900"
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
            className="w-full px-4 py-3 border border-white/30 rounded-lg text-base focus:ring-2 focus:ring-primary focus:border-primary bg-white text-gray-900 placeholder-gray-500"
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
              className="h-5 w-5 text-primary accent-primary rounded"
            />
            <span className="text-gray-200">{field.placeholder || 'Marcar'}</span>
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
            className="w-full px-4 py-3 border border-white/30 rounded-lg text-base focus:ring-2 focus:ring-primary focus:border-primary bg-white text-gray-900 placeholder-gray-500"
          />
        )

      case 'file':
        // Use DocumentField if OCR is enabled, otherwise use FileField
        if (field.validation?.enableOCR) {
          return (
            <DocumentField
              documentType={field.fieldName}
              label={field.label}
              description={field.placeholder}
              required={field.required}
              enableOCR={true}
              acceptedFormats={field.options || ['jpg', 'jpeg', 'png', 'pdf']}
              maxSizeMB={field.validation?.maxSize || 5}
              value={documentData[field.fieldName]}
              onChange={(data) => handleDocumentChange(field.fieldName, data)}
              onOCRExtract={handleOCRExtract}
            />
          )
        }
        return (
          <FileField
            fieldName={field.fieldName}
            label={field.label}
            placeholder={field.placeholder}
            required={field.required}
            accept={field.options || []}
            maxSizeMB={field.validation?.maxSize || 5}
            value={uploadedFiles[field.fieldName]}
            onChange={(data) => {
              if (data) {
                // Store file data in uploadedFiles state
                setUploadedFiles(prev => ({
                  ...prev,
                  [field.fieldName]: {
                    ...data,
                    originalName: data.fileName,
                    size: data.fileSize || 0
                  }
                }))
                // Also update form data
                handleFieldChange(field.fieldName, data.fileName)
              } else {
                // Remove file
                setUploadedFiles(prev => {
                  const newFiles = { ...prev }
                  delete newFiles[field.fieldName]
                  return newFiles
                })
                handleFieldChange(field.fieldName, '')
              }
            }}
          />
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
              className="w-full px-4 py-3 border border-white/30 rounded-lg text-base focus:ring-2 focus:ring-primary focus:border-primary bg-white text-gray-900 placeholder-gray-500"
            />
          )
        }
        // fallthrough to default

      default:
        return (
          <input
            type={field.type}
            name={field.fieldName}
            value={formData[field.fieldName] || ''}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            required={field.required}
            placeholder={field.placeholder}
            className="w-full px-4 py-3 border border-white/30 rounded-lg text-base focus:ring-2 focus:ring-primary focus:border-primary bg-white text-gray-900 placeholder-gray-500"
          />
        )
    }
  }

  if (loading) {
    return (
      <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
        <div className="text-center py-8">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-300">Carregando formulário...</p>
        </div>
      </div>
    )
  }

  console.log('🎨 Rendering form with fields:', fields.length, 'fields')
  
  return (
    <form onSubmit={handleSubmit} className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20 space-y-4">
      {fields.length === 0 && documentFields.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-300">Nenhum campo disponível no momento.</p>
          <p className="text-sm text-gray-400 mt-2">Verifique a configuração dos campos no painel administrativo.</p>
        </div>
      ) : (
        <>
          {/* Stand Selection - Required */}
          {stands.length > 0 && (
            <div className="bg-purple/20 border border-purple-light/30 rounded-lg p-4 mb-4">
              <label className="block text-sm font-medium text-white mb-2">
                Stand <span className="text-red-400">*</span>
              </label>
              <select
                name="standCode"
                value={formData.standCode || formData.estande || ''}
                onChange={(e) => {
                  // Update both standCode and estande fields for compatibility
                  handleFieldChange('standCode', e.target.value)
                  handleFieldChange('estande', e.target.value)
                }}
                required
                className={`w-full px-4 py-3 border rounded-lg text-base focus:ring-2 focus:ring-primary focus:border-primary bg-white text-gray-900 ${
                  errors.standCode ? 'border-red-400' : 'border-white/30'
                }`}
              >
                <option value="">Nenhum stand selecionado</option>
                {stands.map(stand => (
                  <option key={stand.code} value={stand.code}>
                    {stand.name}
                    {stand.location && ` (${stand.location})`}
                  </option>
                ))}
              </select>
              {errors.standCode ? (
                <p className="text-red-400 text-sm mt-2">{errors.standCode}</p>
              ) : (
                <p className="text-xs text-gray-400 mt-2">
                  {formData.standCode ? (
                    <span className="text-neon">✓ Seu registro será associado ao stand selecionado</span>
                  ) : (
                    <>Selecione o stand para o qual você foi convidado</>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Render text fields */}
          {fields
            .filter(field => {
              // Skip "estande" field as it's already shown in the header section
              if (field.fieldName.toLowerCase() === 'estande' && stands.length > 0) {
                return false
              }
              return true
            })
            .map((field) => {
              console.log('Rendering field:', field.fieldName, field.type)
              return (
                <div key={field.fieldName}>
                  {field.type !== 'checkbox' && (
                    <label className="block text-sm font-medium text-white mb-2">
                      {field.label} {field.required && <span className="text-red-400">*</span>}
                    </label>
                  )}
                  {renderField(field)}
                  {errors[field.fieldName] && (
                    <p className="text-red-400 text-sm mt-1">{errors[field.fieldName]}</p>
                  )}
                </div>
              )
            })}
          
          {/* Render document fields */}
          {documentFields.length > 0 && (
            <>
              {documentFields.length > 0 && fields.length > 0 && (
                <div className="border-t border-white/20 pt-4 mt-4">
                  <h3 className="text-sm font-semibold text-neon mb-3">
                    Documentos
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
          className="w-full py-4 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark transition-all duration-200 glow-primary"
        >
          Continuar
        </button>

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="w-full py-4 bg-white/10 text-white border border-white/20 rounded-lg font-semibold hover:bg-white/20 transition-all duration-200"
          >
            Voltar
          </button>
        )}
      </div>
    </form>
  )
}