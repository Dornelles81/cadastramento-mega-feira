'use client'

import { useState } from 'react'

interface PersonalDataFormProps {
  onSubmit: (data: {
    name: string
    cpf: string
    email?: string
    phone?: string
    eventCode?: string
  }) => void
  onBack: () => void
}

export default function PersonalDataForm({ onSubmit, onBack }: PersonalDataFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    cpf: '',
    email: '',
    phone: '',
    eventCode: 'MEGA-FEIRA-2025'
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Format CPF as user types
  const formatCPF = (value: string) => {
    const numbers = value.replace(/\D/g, '')
    const formatted = numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    return formatted.slice(0, 14)
  }

  // Format phone as user types
  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '')
    const formatted = numbers.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
    return formatted.slice(0, 15)
  }

  // Validate CPF using Brazilian algorithm
  const validateCPF = (cpf: string) => {
    const numbers = cpf.replace(/\D/g, '')
    if (numbers.length !== 11 || /^(\d)\1{10}$/.test(numbers)) return false

    let sum = 0
    for (let i = 0; i < 9; i++) {
      sum += parseInt(numbers[i]) * (10 - i)
    }
    let remainder = (sum * 10) % 11
    if (remainder === 10 || remainder === 11) remainder = 0
    if (remainder !== parseInt(numbers[9])) return false

    sum = 0
    for (let i = 0; i < 10; i++) {
      sum += parseInt(numbers[i]) * (11 - i)
    }
    remainder = (sum * 10) % 11
    if (remainder === 10 || remainder === 11) remainder = 0
    return remainder === parseInt(numbers[10])
  }

  // Validate email
  const validateEmail = (email: string) => {
    if (!email) return true // Optional field
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const handleInputChange = (field: string, value: string) => {
    let formattedValue = value

    if (field === 'cpf') {
      formattedValue = formatCPF(value)
    } else if (field === 'phone') {
      formattedValue = formatPhone(value)
    }

    setFormData(prev => ({ ...prev, [field]: formattedValue }))
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    // Required fields
    if (!formData.name.trim()) {
      newErrors.name = 'Nome é obrigatório'
    } else if (formData.name.trim().length < 3) {
      newErrors.name = 'Nome deve ter pelo menos 3 caracteres'
    }

    if (!formData.cpf.trim()) {
      newErrors.cpf = 'CPF é obrigatório'
    } else if (!validateCPF(formData.cpf)) {
      newErrors.cpf = 'CPF inválido'
    }

    // Optional fields validation
    if (formData.email && !validateEmail(formData.email)) {
      newErrors.email = 'Email inválido'
    }

    if (formData.phone && formData.phone.replace(/\D/g, '').length < 10) {
      newErrors.phone = 'Telefone inválido'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (validateForm()) {
      onSubmit({
        name: formData.name.trim(),
        cpf: formData.cpf,
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        eventCode: formData.eventCode
      })
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">
          Dados Pessoais
        </h2>
        <p className="text-mobile-sm text-gray-600">
          Preencha seus dados para o cadastro
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
            Nome Completo *
          </label>
          <input
            id="name"
            type="text"
            value={formData.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            className={`input-mobile ${errors.name ? 'border-red-500 focus:ring-red-500' : ''}`}
            placeholder="Digite seu nome completo"
            maxLength={100}
          />
          {errors.name && (
            <p className="mt-1 text-sm text-red-600">{errors.name}</p>
          )}
        </div>

        {/* CPF */}
        <div>
          <label htmlFor="cpf" className="block text-sm font-medium text-gray-700 mb-2">
            CPF *
          </label>
          <input
            id="cpf"
            type="text"
            value={formData.cpf}
            onChange={(e) => handleInputChange('cpf', e.target.value)}
            className={`input-mobile ${errors.cpf ? 'border-red-500 focus:ring-red-500' : ''}`}
            placeholder="000.000.000-00"
            inputMode="numeric"
          />
          {errors.cpf && (
            <p className="mt-1 text-sm text-red-600">{errors.cpf}</p>
          )}
        </div>

        {/* Email (optional) */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
            Email (opcional)
          </label>
          <input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => handleInputChange('email', e.target.value)}
            className={`input-mobile ${errors.email ? 'border-red-500 focus:ring-red-500' : ''}`}
            placeholder="seu@email.com"
            inputMode="email"
          />
          {errors.email && (
            <p className="mt-1 text-sm text-red-600">{errors.email}</p>
          )}
        </div>

        {/* Phone (optional) */}
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
            Telefone (opcional)
          </label>
          <input
            id="phone"
            type="tel"
            value={formData.phone}
            onChange={(e) => handleInputChange('phone', e.target.value)}
            className={`input-mobile ${errors.phone ? 'border-red-500 focus:ring-red-500' : ''}`}
            placeholder="(11) 99999-9999"
            inputMode="tel"
          />
          {errors.phone && (
            <p className="mt-1 text-sm text-red-600">{errors.phone}</p>
          )}
        </div>

        {/* Event code (readonly) */}
        <div>
          <label htmlFor="eventCode" className="block text-sm font-medium text-gray-700 mb-2">
            Código do Evento
          </label>
          <input
            id="eventCode"
            type="text"
            value={formData.eventCode}
            readOnly
            className="input-mobile bg-gray-50 text-gray-600"
          />
        </div>

        {/* Submit button */}
        <div className="pt-4 space-y-3">
          <button
            type="submit"
            className="btn-primary w-full"
          >
            Continuar para Captura →
          </button>

          <button
            type="button"
            onClick={onBack}
            className="btn-secondary w-full"
          >
            ← Voltar
          </button>
        </div>
      </form>

      {/* Help text */}
      <div className="bg-blue-50 rounded-lg p-4">
        <p className="text-xs text-blue-700">
          💡 <strong>Dica:</strong> Certifique-se de que seus dados estão corretos. 
          Eles serão usados para sua identificação no evento.
        </p>
      </div>
    </div>
  )
}