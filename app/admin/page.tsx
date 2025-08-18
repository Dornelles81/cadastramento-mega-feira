'use client'

import { useState, useEffect } from 'react'

interface Participant {
  id: string
  name: string
  cpf: string
  email?: string
  phone?: string
  eventCode: string
  createdAt: string
  consentAccepted: boolean
  captureQuality?: number
  hasValidFace: boolean
  faceImageUrl?: string
  faceImage?: string
  customData?: any
}

const MOCK_PARTICIPANTS: Participant[] = [
  {
    id: '1',
    name: 'João Silva',
    cpf: '123.456.789-00',
    email: 'joao@email.com',
    phone: '(11) 99999-1234',
    event: 'expointer',
    mesa: '01',
    registeredAt: '2025-08-14T10:30:00Z',
    faceImage: {
      data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAoACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5/ooooA//2Q==',
      metadata: {
        width: 640,
        height: 480,
        format: 'jpeg',
        quality: 0.9,
        fileSize: 45672,
        capturedAt: '2025-08-14T10:30:00Z'
      }
    }
  },
  {
    id: '2', 
    name: 'Maria Santos',
    cpf: '987.654.321-00',
    phone: '(11) 98888-5678',
    event: 'freio-de-ouro',
    mesa: '15',
    registeredAt: '2025-08-14T11:15:00Z',
    faceImage: {
      data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAoACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5/ooooA//2Q==',
      metadata: {
        width: 640,
        height: 480,
        format: 'jpeg',
        quality: 0.85,
        fileSize: 42315,
        capturedAt: '2025-08-14T11:15:00Z'
      }
    }
  },
  {
    id: '3',
    name: 'Carlos Oliveira', 
    cpf: '456.789.123-00',
    email: 'carlos@email.com',
    phone: '(11) 97777-9012',
    event: 'morfologia',
    mesa: '33',
    registeredAt: '2025-08-14T09:45:00Z',
    faceImage: {
      data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAoACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5/ooooA//2Q==',
      metadata: {
        width: 640,
        height: 480,
        format: 'jpeg',
        quality: 0.9,
        fileSize: 48923,
        capturedAt: '2025-08-14T09:45:00Z'
      }
    }
  }
]

export default function AdminPage() {
  const [participants, setParticipants] = useState<Participant[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEvent, setSelectedEvent] = useState<string>('')
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null)
  const [viewingImage, setViewingImage] = useState<Participant | null>(null)
  const [isPasswordValid, setIsPasswordValid] = useState(false)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [participantImages, setParticipantImages] = useState<Record<string, string>>({})

  // Load participants from database with filters
  const loadParticipants = async (search?: string, event?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (event) params.append('eventCode', event)
      
      const response = await fetch(`/api/participants?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setParticipants(data.participants || [])
        
        // Load images for each participant
        const images: Record<string, string> = {}
        for (const participant of data.participants || []) {
          try {
            const imgResponse = await fetch(`/api/participant-image?id=${participant.id}`)
            if (imgResponse.ok) {
              const imgData = await imgResponse.json()
              if (imgData.imageUrl) {
                images[participant.id] = imgData.imageUrl
              }
            }
          } catch (error) {
            console.error(`Failed to load image for ${participant.id}`)
          }
        }
        setParticipantImages(images)
      }
    } catch (error) {
      console.error('Failed to load participants:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isPasswordValid) {
      loadParticipants()
    }
  }, [isPasswordValid])

  // Auto-reload when filters change with debounce
  useEffect(() => {
    if (!isPasswordValid) return

    const timeoutId = setTimeout(() => {
      loadParticipants(searchTerm, selectedEvent)
    }, 500) // 500ms debounce

    return () => clearTimeout(timeoutId)
  }, [searchTerm, selectedEvent, isPasswordValid])

  // Simple password protection
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password === 'admin123') {
      setIsPasswordValid(true)
    } else {
      alert('Senha incorreta!')
    }
  }

  if (!isPasswordValid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <div className="mb-4 flex justify-center">
              <img 
                src="/mega-feira-logo.svg" 
                alt="Mega Feira" 
                className="h-16 w-auto"
              />
            </div>
            <div className="text-4xl mb-4">🔒</div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">
              Painel Administrativo
            </h1>
            <p className="text-gray-600">
              Digite a senha para acessar
            </p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mega-500 focus:border-mega-500"
                placeholder="Digite a senha..."
                required
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-mega-500 text-white rounded-lg font-semibold hover:bg-mega-600 transition-colors"
            >
              Entrar
            </button>
          </form>
          
          <div className="mt-4 text-center">
            <p className="text-xs text-gray-500">
              💡 <em>Demo: senha = admin123</em>
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Use participants directly from API (already filtered)
  const filteredParticipants = participants

  const formatEventName = (eventCode: string) => {
    switch(eventCode) {
      case 'expointer': return 'Expointer'
      case 'freio-de-ouro': return 'Freio de Ouro'
      case 'morfologia': return 'Morfologia'
      case 'MEGA-FEIRA-2025': return 'Mega Feira 2025'
      default: return eventCode
    }
  }

  const handleEdit = (participant: Participant) => {
    setEditingParticipant({...participant})
  }

  const handleSave = () => {
    if (editingParticipant) {
      setParticipants(prev => 
        prev.map(p => p.id === editingParticipant.id ? editingParticipant : p)
      )
      setEditingParticipant(null)
    }
  }

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este registro?')) {
      setParticipants(prev => prev.filter(p => p.id !== id))
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <img 
                src="/mega-feira-logo.svg" 
                alt="Mega Feira" 
                className="h-12 w-auto"
              />
              <div>
                <h1 className="text-2xl font-bold text-gray-800 mb-2">
                  📊 Painel Administrativo
                </h1>
                <p className="text-gray-600">
                  Gerenciar registros de participantes
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">Total de registros</div>
              <div className="text-2xl font-bold text-mega-600">{participants.length}</div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                🔍 Buscar por nome ou CPF
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mega-500 focus:border-mega-500"
                placeholder="Digite o nome ou CPF (ex: João, 123.456.789-01, 12345678901)..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                🎪 Filtrar por evento
              </label>
              <select
                value={selectedEvent}
                onChange={(e) => setSelectedEvent(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mega-500 focus:border-mega-500 bg-white"
              >
                <option value="">Todos os eventos</option>
                <option value="expointer">Expointer</option>
                <option value="freio-de-ouro">Freio de Ouro</option>
                <option value="morfologia">Morfologia</option>
              </select>
            </div>
          </div>
        </div>

        {/* Results Summary */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex justify-between items-center">
            <p className="text-gray-600">
              Mostrando <strong>{filteredParticipants.length}</strong> registros
              {loading && <span className="ml-2 text-blue-500">🔄 Carregando...</span>}
            </p>
            <button
              onClick={() => loadParticipants(searchTerm, selectedEvent)}
              className="text-sm bg-mega-500 text-white px-3 py-1 rounded hover:bg-mega-600"
              disabled={loading}
            >
              🔄 Atualizar
            </button>
          </div>
        </div>

        {/* Participants Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Face</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Nome</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">CPF</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Evento</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Email</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Telefone</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Qualidade</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Cadastrado em</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredParticipants.map((participant) => (
                  <tr key={participant.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        {participantImages[participant.id] ? (
                          <button
                            onClick={() => setViewingImage(participant)}
                            className="relative group"
                          >
                            <img 
                              src={participantImages[participant.id]}
                              alt={`Foto de ${participant.name}`}
                              className="w-10 h-10 rounded-full object-cover border-2 border-gray-200 group-hover:border-mega-500 transition-colors"
                            />
                            <div className="absolute inset-0 rounded-full bg-black bg-opacity-0 group-hover:bg-opacity-20 flex items-center justify-center transition-opacity">
                              <span className="text-white opacity-0 group-hover:opacity-100 text-xs">👁️</span>
                            </div>
                          </button>
                        ) : (
                          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                            <span className="text-gray-400 text-xs">👤</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-900">{participant.name}</td>
                    <td className="px-6 py-4 text-gray-600 font-mono">{participant.cpf}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-mega-100 text-mega-800">
                        {formatEventName(participant.eventCode)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{participant.email || '-'}</td>
                    <td className="px-6 py-4 text-gray-600 font-mono">{participant.phone || '-'}</td>
                    <td className="px-6 py-4 text-gray-600">
                      {participant.captureQuality ? 
                        `${Math.round(participant.captureQuality * 100)}%` : 
                        '-'
                      }
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {new Date(participant.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(participant)}
                          className="text-mega-600 hover:text-mega-800 text-sm font-medium"
                        >
                          ✏️ Editar
                        </button>
                        <button
                          onClick={() => handleDelete(participant.id)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium"
                        >
                          🗑️ Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredParticipants.length === 0 && (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">😔</div>
              <p className="text-gray-500">Nenhum registro encontrado</p>
            </div>
          )}
        </div>

        {/* Edit Modal */}
        {editingParticipant && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                ✏️ Editar Participante
              </h3>

              {/* Display participant image if available */}
              {participantImages[editingParticipant.id] && (
                <div className="mb-4 text-center">
                  <img 
                    src={participantImages[editingParticipant.id]}
                    alt={`Foto de ${editingParticipant.name}`}
                    className="w-32 h-32 rounded-full object-cover mx-auto border-4 border-gray-200 shadow-lg"
                  />
                  <p className="text-sm text-gray-500 mt-2">Foto do participante</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nome
                  </label>
                  <input
                    type="text"
                    value={editingParticipant.name}
                    onChange={(e) => setEditingParticipant({
                      ...editingParticipant,
                      name: e.target.value
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mega-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    CPF
                  </label>
                  <input
                    type="text"
                    value={editingParticipant.cpf}
                    onChange={(e) => setEditingParticipant({
                      ...editingParticipant,
                      cpf: e.target.value
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mega-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Evento
                  </label>
                  <select
                    value={editingParticipant.eventCode}
                    onChange={(e) => setEditingParticipant({
                      ...editingParticipant,
                      eventCode: e.target.value
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mega-500 bg-white"
                  >
                    <option value="MEGA-FEIRA-2025">Mega Feira 2025</option>
                    <option value="expointer">Expointer</option>
                    <option value="freio-de-ouro">Freio de Ouro</option>
                    <option value="morfologia">Morfologia</option>
                  </select>
                </div>


                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={editingParticipant.email || ''}
                    onChange={(e) => setEditingParticipant({
                      ...editingParticipant,
                      email: e.target.value
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mega-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Telefone
                  </label>
                  <input
                    type="tel"
                    value={editingParticipant.phone || ''}
                    onChange={(e) => setEditingParticipant({
                      ...editingParticipant,
                      phone: e.target.value
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mega-500"
                    placeholder="(11) 99999-9999"
                  />
                </div>

                {/* Custom Fields Summary */}
                {editingParticipant.customData && Object.keys(editingParticipant.customData).length > 0 && (
                  <div className="col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      📋 Campos Personalizados
                    </label>
                    <div className="bg-gray-50 rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
                      {Object.entries(editingParticipant.customData).map(([key, value]) => {
                        // Check if value is a file path
                        if (typeof value === 'string' && value.startsWith('/uploads/')) {
                          const filename = value.split('/').pop()
                          return (
                            <div key={key} className="flex justify-between text-sm">
                              <span className="font-medium text-gray-600 capitalize">
                                {key.replace(/_/g, ' ')}:
                              </span>
                              <a 
                                href={`/api${value}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-mega-600 hover:text-mega-700 underline flex items-center gap-1"
                              >
                                📎 {filename}
                              </a>
                            </div>
                          )
                        }
                        return (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="font-medium text-gray-600 capitalize">
                              {key.replace(/_/g, ' ')}:
                            </span>
                            <span className="text-gray-800">{String(value) || '-'}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  onClick={handleSave}
                  className="flex-1 py-2 bg-mega-500 text-white rounded-lg font-semibold hover:bg-mega-600"
                >
                  💾 Salvar
                </button>
                <button
                  onClick={() => setEditingParticipant(null)}
                  className="flex-1 py-2 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300"
                >
                  ❌ Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Image View Modal */}
        {viewingImage && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-4xl max-h-[90vh] overflow-auto">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">
                      🖼️ Imagem Facial - {viewingImage.name}
                    </h3>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p><strong>CPF:</strong> {viewingImage.cpf}</p>
                      <p><strong>Evento:</strong> {formatEventName(viewingImage.eventCode)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setViewingImage(null)}
                    className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                  >
                    ×
                  </button>
                </div>

                {participantImages[viewingImage.id] && (
                  <div className="space-y-4">
                    {/* Image Display */}
                    <div className="text-center">
                      <img 
                        src={participantImages[viewingImage.id]}
                        alt={`Foto facial de ${viewingImage.name}`}
                        className="max-w-full h-auto rounded-lg border border-gray-200 shadow-lg mx-auto"
                        style={{ maxHeight: '400px' }}
                      />
                    </div>

                    {/* Image Info */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-800 mb-2">📊 Informações da Imagem:</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-gray-600">Status:</span>
                          <br />
                          <span className="text-green-600">✅ Capturada com sucesso</span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">Qualidade:</span>
                          <br />
                          {viewingImage.captureQuality ? 
                            `${Math.round(viewingImage.captureQuality * 100)}%` : 
                            'Não disponível'}
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">Registrado em:</span>
                          <br />
                          {new Date(viewingImage.createdAt).toLocaleString('pt-BR')}
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">Consentimento:</span>
                          <br />
                          {viewingImage.consentAccepted ? '✅ Aceito' : '❌ Não aceito'}
                        </div>
                      </div>
                    </div>

                    {/* Export Options */}
                    <div className="bg-mega-50 rounded-lg p-4 border border-mega-200">
                      <h4 className="font-semibold text-mega-800 mb-2">📤 Opções de Exportação:</h4>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={`/api/export/participants/${viewingImage.id}/image?format=binary&download=true`}
                          className="inline-flex items-center px-3 py-1 bg-mega-500 text-white text-sm rounded hover:bg-mega-600 transition-colors"
                        >
                          💾 Download Imagem
                        </a>
                        <a
                          href={`/api/export/participants/${viewingImage.id}/image?format=metadata`}
                          target="_blank"
                          className="inline-flex items-center px-3 py-1 bg-feira-600 text-white text-sm rounded hover:bg-feira-700 transition-colors"
                        >
                          📋 Ver Metadados (JSON)
                        </a>
                        <a
                          href={`/api/export/participants?format=ultrathink&include_images=true`}
                          target="_blank"
                          className="inline-flex items-center px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
                        >
                          🔗 API Ultrathink
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-6 text-center">
                  <button
                    onClick={() => setViewingImage(null)}
                    className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-8 p-4 space-x-4">
          <a
            href="/"
            className="inline-flex items-center px-4 py-2 bg-mega-500 text-white rounded-lg hover:bg-mega-600 transition-colors"
          >
            ← Voltar para o Cadastro
          </a>
          <a
            href="/admin/fields/login"
            className="inline-flex items-center px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
          >
            🔧 Gerenciar Campos
          </a>
          <a
            href="/admin/documents"
            className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            📄 Gerenciar Documentos
          </a>
        </div>
      </div>
    </div>
  )
}