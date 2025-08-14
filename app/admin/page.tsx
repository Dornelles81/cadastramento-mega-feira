'use client'

import { useState, useEffect } from 'react'

interface Participant {
  id: string
  name: string
  cpf: string
  email?: string
  phone: string
  event: string
  mesa: string
  registeredAt: string
  faceImage?: {
    data: string
    metadata: {
      width: number
      height: number
      format: string
      quality: number
      fileSize: number
      capturedAt: string
    }
  }
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
  const [participants, setParticipants] = useState<Participant[]>(MOCK_PARTICIPANTS)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEvent, setSelectedEvent] = useState<string>('')
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null)
  const [viewingImage, setViewingImage] = useState<Participant | null>(null)
  const [isPasswordValid, setIsPasswordValid] = useState(false)
  const [password, setPassword] = useState('')

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

  // Filter participants
  const filteredParticipants = participants.filter(participant => {
    const matchesSearch = participant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         participant.cpf.includes(searchTerm)
    const matchesEvent = selectedEvent === '' || participant.event === selectedEvent
    return matchesSearch && matchesEvent
  })

  const formatEventName = (event: string) => {
    switch(event) {
      case 'expointer': return 'Expointer'
      case 'freio-de-ouro': return 'Freio de Ouro'
      case 'morfologia': return 'Morfologia'
      default: return event
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
                placeholder="Digite o nome ou CPF..."
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
          <p className="text-gray-600">
            Mostrando <strong>{filteredParticipants.length}</strong> de <strong>{participants.length}</strong> registros
          </p>
        </div>

        {/* Participants Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Imagem</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Nome</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">CPF</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Evento</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Mesa</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Email</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Telefone</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Cadastrado em</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredParticipants.map((participant) => (
                  <tr key={participant.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      {participant.faceImage ? (
                        <div className="flex items-center space-x-2">
                          <img 
                            src={participant.faceImage.data}
                            alt={`Foto de ${participant.name}`}
                            className="w-12 h-12 rounded-full object-cover border-2 border-mega-200 cursor-pointer hover:border-mega-400 transition-colors"
                            onClick={() => setViewingImage(participant)}
                            title="Clique para ampliar"
                          />
                          <div className="text-xs text-gray-500">
                            <div>{participant.faceImage.metadata.width}x{participant.faceImage.metadata.height}</div>
                            <div>{(participant.faceImage.metadata.fileSize / 1024).toFixed(1)}KB</div>
                          </div>
                        </div>
                      ) : (
                        <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                          <span className="text-gray-400 text-xs">Sem foto</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-900">{participant.name}</td>
                    <td className="px-6 py-4 text-gray-600 font-mono">{participant.cpf}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-mega-100 text-mega-800">
                        {formatEventName(participant.event)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600 font-mono">Mesa {participant.mesa}</td>
                    <td className="px-6 py-4 text-gray-600">{participant.email || '-'}</td>
                    <td className="px-6 py-4 text-gray-600 font-mono">{participant.phone}</td>
                    <td className="px-6 py-4 text-gray-600">
                      {new Date(participant.registeredAt).toLocaleString('pt-BR')}
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
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                ✏️ Editar Participante
              </h3>

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
                    value={editingParticipant.event}
                    onChange={(e) => setEditingParticipant({
                      ...editingParticipant,
                      event: e.target.value
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mega-500 bg-white"
                  >
                    <option value="expointer">Expointer</option>
                    <option value="freio-de-ouro">Freio de Ouro</option>
                    <option value="morfologia">Morfologia</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mesa
                  </label>
                  <select
                    value={editingParticipant.mesa}
                    onChange={(e) => setEditingParticipant({
                      ...editingParticipant,
                      mesa: e.target.value
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mega-500 bg-white"
                  >
                    {Array.from({ length: 83 }, (_, i) => {
                      const num = (i + 1).toString().padStart(2, '0')
                      return (
                        <option key={num} value={num}>Mesa {num}</option>
                      )
                    })}
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
                    Telefone *
                  </label>
                  <input
                    type="tel"
                    value={editingParticipant.phone}
                    onChange={(e) => setEditingParticipant({
                      ...editingParticipant,
                      phone: e.target.value
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mega-500"
                    placeholder="(11) 99999-9999"
                    required
                  />
                </div>
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
                      <p><strong>Evento:</strong> {formatEventName(viewingImage.event)}</p>
                      <p><strong>Mesa:</strong> {viewingImage.mesa}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setViewingImage(null)}
                    className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                  >
                    ×
                  </button>
                </div>

                {viewingImage.faceImage && (
                  <div className="space-y-4">
                    {/* Image Display */}
                    <div className="text-center">
                      <img 
                        src={viewingImage.faceImage.data}
                        alt={`Foto facial de ${viewingImage.name}`}
                        className="max-w-full h-auto rounded-lg border border-gray-200 shadow-lg"
                        style={{ maxHeight: '400px' }}
                      />
                    </div>

                    {/* Image Metadata */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-800 mb-2">📊 Metadados da Imagem:</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-gray-600">Dimensões:</span>
                          <br />
                          {viewingImage.faceImage.metadata.width} × {viewingImage.faceImage.metadata.height}px
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">Formato:</span>
                          <br />
                          {viewingImage.faceImage.metadata.format.toUpperCase()}
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">Qualidade:</span>
                          <br />
                          {Math.round(viewingImage.faceImage.metadata.quality * 100)}%
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">Tamanho:</span>
                          <br />
                          {(viewingImage.faceImage.metadata.fileSize / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        <strong>Capturada em:</strong> {new Date(viewingImage.faceImage.metadata.capturedAt).toLocaleString('pt-BR')}
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
        <div className="text-center mt-8 p-4">
          <a
            href="/"
            className="inline-flex items-center px-4 py-2 bg-mega-500 text-white rounded-lg hover:bg-mega-600 transition-colors"
          >
            ← Voltar para o Cadastro
          </a>
        </div>
      </div>
    </div>
  )
}