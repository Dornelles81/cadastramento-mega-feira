'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

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
  documents?: any
  approvalStatus?: string
  approvedAt?: string
  approvedBy?: string
  rejectionReason?: string
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

interface Stand {
  code: string
  name: string
  count: number
}

interface Event {
  id: string
  name: string
  code: string
  slug: string
}

export default function EventAdminPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session, status } = useSession()
  const eventSlug = params?.slug as string

  // Check if user is Super Admin
  const isSuperAdmin = (session?.user as any)?.role === 'SUPER_ADMIN'

  const [event, setEvent] = useState<Event | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStand, setSelectedStand] = useState<string>('all')
  const [stands, setStands] = useState<Stand[]>([])
  const [darkMode, setDarkMode] = useState(false)
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null)
  const [viewingImage, setViewingImage] = useState<Participant | null>(null)
  const [loading, setLoading] = useState(false)
  const [participantImages, setParticipantImages] = useState<Record<string, string>>({})
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)

  // Calculate stands and their counts whenever participants change
  useEffect(() => {
    const standCounts: Record<string, { name: string, count: number }> = {}

    participants.forEach(participant => {
      const standCode = participant.customData?.standCode || participant.customData?.estande || 'Sem stand'
      if (!standCounts[standCode]) {
        standCounts[standCode] = {
          name: standCode,
          count: 0
        }
      }
      standCounts[standCode].count++
    })

    const standsArray: Stand[] = Object.entries(standCounts).map(([code, data]) => ({
      code,
      name: data.name,
      count: data.count
    })).sort((a, b) => b.count - a.count) // Sort by count descending

    setStands(standsArray)
  }, [participants])

  // Load dark mode preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedDarkMode = localStorage.getItem('adminDarkMode')
      setDarkMode(savedDarkMode === 'true')
    }
  }, [])

  // Save dark mode preference
  const toggleDarkMode = () => {
    const newDarkMode = !darkMode
    setDarkMode(newDarkMode)
    if (typeof window !== 'undefined') {
      localStorage.setItem('adminDarkMode', String(newDarkMode))
    }
  }

  // Authentication check - redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/admin/login')
    }
  }, [status, router])

  // Get event info from session or API
  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      const user = session.user as any

      // Find event in user's events list
      if (user.events && user.events.length > 0) {
        const userEvent = user.events.find((e: any) => e.slug === eventSlug)
        if (userEvent) {
          setEvent({
            id: userEvent.id,
            name: userEvent.name,
            code: userEvent.code,
            slug: userEvent.slug
          })
        }
      }

      // If Super Admin and no event in list, fetch from API to get correct eventId
      if (user.role === 'SUPER_ADMIN' && !event) {
        const loadEventFromAPI = async () => {
          try {
            const response = await fetch(`/api/admin/eventos/${eventSlug}`)
            if (response.ok) {
              const data = await response.json()
              if (data.event) {
                setEvent({
                  id: data.event.id,
                  name: data.event.name,
                  code: data.event.code,
                  slug: data.event.slug
                })
              }
            }
          } catch (error) {
            console.error('❌ Error loading event from API:', error)
            // Fallback to placeholder if API fails
            setEvent({
              id: '',
              name: eventSlug.replace(/-/g, ' ').toUpperCase(),
              code: '',
              slug: eventSlug
            })
          }
        }
        loadEventFromAPI()
      }
    }
  }, [status, session, eventSlug])

  // Access control - check if user has permission for this event
  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      const user = session.user as any
      const isSuperAdmin = user.role === 'SUPER_ADMIN'

      console.log('🔐 Access Check:', {
        user: user.email,
        role: user.role,
        isSuperAdmin,
        eventSlug,
        userEvents: user.events
      })

      if (isSuperAdmin) {
        // Super Admin has access to all events
        console.log('✅ Super Admin - Access granted')
        setHasAccess(true)
      } else {
        // Check if Event Admin has access to this specific event
        const userEvents = user.events || []
        const eventAccess = userEvents.find((e: any) => e.slug === eventSlug)
        console.log('🔍 Event Admin check:', { found: !!eventAccess, eventAccess })
        setHasAccess(!!eventAccess)
      }
    } else if (status === 'unauthenticated') {
      console.log('❌ Not authenticated')
      setHasAccess(false)
    }
  }, [status, session, eventSlug])

  // Load participants from database with filters
  const loadParticipants = async (search?: string) => {
    setLoading(true)
    try {
      // Use eventId if available and valid (more reliable), otherwise fall back to eventCode
      const hasValidEventId = event?.id && event.id.length > 0
      const queryParam = hasValidEventId
        ? `eventId=${event.id}`
        : `eventCode=${eventSlug.toUpperCase()}`

      console.log('📥 Loading participants for:', {
        eventSlug,
        eventId: event?.id,
        hasValidEventId,
        queryParam
      })

      // Use admin API with event filter - CRITICAL: Only load this event's participants
      const response = await fetch(`/api/admin/participants-full?${queryParam}`)
      if (response.ok) {
        const data = await response.json()
        let participants = data.participants || []

        // Apply search filters locally
        if (search) {
          participants = participants.filter((p: Participant) =>
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.cpf.includes(search)
          )
        }

        setParticipants(participants)
        
        // Load images for each participant (only if not already in data)
        const images: Record<string, string> = {}
        for (const participant of data.participants || []) {
          // Use faceImageUrl if available, otherwise try to fetch
          if (participant.faceImageUrl) {
            images[participant.id] = participant.faceImageUrl
          } else {
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
    if (hasAccess && event) {
      loadParticipants()
    }
  }, [hasAccess, event])

  // Auto-reload when filters change with debounce
  useEffect(() => {
    if (!hasAccess || !event) return

    const timeoutId = setTimeout(() => {
      loadParticipants(searchTerm)
    }, 500) // 500ms debounce

    return () => clearTimeout(timeoutId)
  }, [searchTerm, hasAccess, event])

  // Show loading while checking authentication
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">⏳</div>
          <p className="text-gray-600">Verificando autenticação...</p>
        </div>
      </div>
    )
  }

  // Show access denied if user doesn't have permission
  if (status === 'authenticated' && hasAccess === false) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md text-center">
          <div className="text-6xl mb-4">🚫</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Acesso Negado
          </h1>
          <p className="text-gray-600 mb-6">
            Você não tem permissão para acessar este evento.
          </p>
          <button
            onClick={() => router.push('/admin/dashboard')}
            className="px-6 py-3 bg-mega-500 text-white rounded-lg font-semibold hover:bg-mega-600 transition-colors"
          >
            Voltar ao Dashboard
          </button>
        </div>
      </div>
    )
  }

  // Show loading while checking access
  if (hasAccess === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">⏳</div>
          <p className="text-gray-600">Verificando permissões...</p>
        </div>
      </div>
    )
  }

  // Filter participants by search term and selected stand
  const filteredParticipants = participants.filter(participant => {
    // Filter by search term
    const matchesSearch = !searchTerm ||
      participant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      participant.cpf.includes(searchTerm) ||
      participant.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      participant.phone?.includes(searchTerm)

    // Filter by selected stand
    const participantStand = participant.customData?.standCode || participant.customData?.estande || ''
    const matchesStand = selectedStand === 'all' || participantStand === selectedStand

    return matchesSearch && matchesStand
  })

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

  const handleSave = async () => {
    if (editingParticipant) {
      try {
        const response = await fetch(`/api/admin/participants/${editingParticipant.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingParticipant)
        })
        
        if (response.ok) {
          // Update local state
          setParticipants(prev => 
            prev.map(p => p.id === editingParticipant.id ? editingParticipant : p)
          )
          setEditingParticipant(null)
          alert('Participante atualizado com sucesso! Log de audição registrado.')
        } else {
          alert('Erro ao atualizar participante')
        }
      } catch (error) {
        console.error('Error saving participant:', error)
        alert('Erro ao salvar alterações')
      }
    }
  }

  const handleApprove = async (participant: Participant) => {
    try {
      const response = await fetch('/api/admin/participant-approval', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin-token-mega-feira-2025'
        },
        body: JSON.stringify({
          participantId: participant.id,
          action: 'approve'
        })
      })
      
      if (response.ok) {
        // Update local state
        setParticipants(prev => 
          prev.map(p => p.id === participant.id 
            ? { ...p, approvalStatus: 'approved', approvedAt: new Date().toISOString(), approvedBy: 'admin' } 
            : p)
        )
        alert(`✅ ${participant.name} aprovado com sucesso!`)
      } else {
        alert('Erro ao aprovar participante')
      }
    } catch (error) {
      console.error('Error approving participant:', error)
      alert('Erro ao aprovar participante')
    }
  }

  const handleReject = async (participant: Participant) => {
    const reason = prompt(`Motivo da rejeição de ${participant.name}:`)
    if (!reason) return
    
    try {
      const response = await fetch('/api/admin/participant-approval', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin-token-mega-feira-2025'
        },
        body: JSON.stringify({
          participantId: participant.id,
          action: 'reject',
          reason
        })
      })
      
      if (response.ok) {
        // Update local state
        setParticipants(prev => 
          prev.map(p => p.id === participant.id 
            ? { ...p, approvalStatus: 'rejected', rejectionReason: reason } 
            : p)
        )
        alert(`❌ ${participant.name} rejeitado!`)
      } else {
        alert('Erro ao rejeitar participante')
      }
    } catch (error) {
      console.error('Error rejecting participant:', error)
      alert('Erro ao rejeitar participante')
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este registro? Esta ação será registrada nos logs.')) {
      try {
        const response = await fetch(`/api/admin/participants/${id}`, {
          method: 'DELETE'
        })
        
        if (response.ok) {
          // Update local state
          setParticipants(prev => prev.filter(p => p.id !== id))
          alert('Participante excluído com sucesso! Log de exclusão registrado.')
        } else {
          alert('Erro ao excluir participante')
        }
      } catch (error) {
        console.error('Error deleting participant:', error)
        alert('Erro ao excluir participante')
      }
    }
  }

  return (
    <div className={`min-h-screen p-4 ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className={`rounded-lg shadow-sm p-4 md:p-6 mb-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <img
                src="/mega-feira-logo.svg"
                alt="Mega Feira"
                className="h-10 md:h-12 w-auto"
              />
              <div>
                <h1 className={`text-xl md:text-2xl font-bold mb-1 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                  📊 {event ? event.name : 'Painel Administrativo'}
                </h1>
                <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  Gerenciar participantes do evento
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full lg:w-auto">
              <div className="text-left sm:text-right">
                <div className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>Total de registros</div>
                <div className={`text-2xl font-bold ${darkMode ? 'text-green-400' : 'text-mega-600'}`}>{participants.length}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/api/export/participants?format=excel`}
                  className="inline-flex items-center px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                  title="Exportar para Excel"
                >
                  📊 <span className="hidden sm:inline ml-1">Excel</span>
                </a>
                <a
                  href={`/api/export/participants?format=pdf`}
                  className="inline-flex items-center px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm"
                  title="Exportar para PDF"
                >
                  📄 <span className="hidden sm:inline ml-1">PDF</span>
                </a>
                <a
                  href="/admin/hikcental"
                  className="inline-flex items-center px-3 py-2 text-sm bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-sm"
                  title="Integração com HikCentral - Exportar participantes para reconhecimento facial"
                >
                  🔗 <span className="hidden md:inline ml-1">HikCentral</span>
                </a>
                <a
                  href="/admin/logs"
                  className="inline-flex items-center px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
                  title="Ver logs de auditoria"
                >
                  📋 <span className="hidden sm:inline ml-1">Logs</span>
                </a>
                <a
                  href="/admin/hikvision"
                  className="inline-flex items-center px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                  title="Integração Hikvision"
                >
                  🎥 <span className="hidden md:inline ml-1">Hikvision</span>
                </a>
                <a
                  href="/admin/approvals"
                  className="inline-flex items-center px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
                  title="Central de Aprovações"
                >
                  ✅ <span className="hidden sm:inline ml-1">Aprovações</span>
                </a>
                <button
                  onClick={toggleDarkMode}
                  className={`inline-flex items-center px-3 py-2 text-sm rounded-lg transition-colors shadow-sm ${
                    darkMode
                      ? 'bg-yellow-500 text-gray-900 hover:bg-yellow-400'
                      : 'bg-gray-700 text-white hover:bg-gray-600'
                  }`}
                  title={darkMode ? 'Modo Claro' : 'Modo Escuro'}
                >
                  {darkMode ? '☀️' : '🌙'} <span className="hidden sm:inline ml-1">{darkMode ? 'Claro' : 'Escuro'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filter */}
        <div className={`rounded-lg shadow-sm p-4 md:p-6 mb-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
            <div className="flex-1">
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                🔍 Buscar por nome ou CPF
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-mega-500 text-sm ${
                  darkMode
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
                placeholder="Digite o nome ou CPF..."
              />
            </div>
            <div className="flex-1 sm:max-w-xs">
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                🏪 Filtrar por stand
              </label>
              <select
                value={selectedStand}
                onChange={(e) => setSelectedStand(e.target.value)}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-mega-500 text-sm ${
                  darkMode
                    ? 'bg-gray-700 border-gray-600 text-white'
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
              >
                <option value="all">Todos os stands ({participants.length})</option>
                {stands.map(stand => (
                  <option key={stand.code} value={stand.code}>
                    {stand.name} ({stand.count})
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => {
                setSearchTerm('')
                setSelectedStand('all')
              }}
              className={`px-4 py-3 rounded-lg transition-colors text-sm whitespace-nowrap ${
                darkMode
                  ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
              title="Limpar filtros"
            >
              🧹 Limpar
            </button>
          </div>
        </div>

        {/* Results Summary */}
        <div className={`rounded-lg shadow-sm p-4 mb-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-6 w-full sm:w-auto">
              <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                Mostrando <strong>{filteredParticipants.length}</strong> registros
                {loading && <span className="ml-2 text-blue-500">🔄 Carregando...</span>}
              </p>
              <div className="flex flex-wrap gap-3 text-xs sm:text-sm">
                <span className="text-green-600 whitespace-nowrap">
                  ✅ Aprovados: <strong>{filteredParticipants.filter(p => p.approvalStatus === 'approved').length}</strong>
                </span>
                <span className="text-yellow-600 whitespace-nowrap">
                  ⏳ Pendentes: <strong>{filteredParticipants.filter(p => !p.approvalStatus || p.approvalStatus === 'pending').length}</strong>
                </span>
                <span className="text-red-600 whitespace-nowrap">
                  ❌ Rejeitados: <strong>{filteredParticipants.filter(p => p.approvalStatus === 'rejected').length}</strong>
                </span>
              </div>
            </div>
            <button
              onClick={() => loadParticipants(searchTerm)}
              className="text-xs sm:text-sm bg-mega-500 text-white px-3 py-2 rounded hover:bg-mega-600 whitespace-nowrap w-full sm:w-auto"
              disabled={loading}
            >
              🔄 Atualizar
            </button>
          </div>
        </div>

        {/* Participants Table */}
        <div className={`rounded-lg shadow-sm overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto">
              <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
                <tr>
                  <th className={`text-left px-2 md:px-4 py-3 font-semibold text-xs md:text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Face</th>
                  <th className={`text-left px-2 md:px-4 py-3 font-semibold text-xs md:text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Nome</th>
                  <th className={`text-left px-2 md:px-4 py-3 font-semibold text-xs md:text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>CPF</th>
                  <th className={`text-left px-2 md:px-4 py-3 font-semibold text-xs md:text-sm hidden sm:table-cell ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Status</th>
                  <th className={`text-left px-2 md:px-4 py-3 font-semibold text-xs md:text-sm hidden md:table-cell ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Evento</th>
                  <th className={`text-left px-2 md:px-4 py-3 font-semibold text-xs md:text-sm hidden lg:table-cell ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Email</th>
                  <th className={`text-left px-2 md:px-4 py-3 font-semibold text-xs md:text-sm hidden lg:table-cell ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Telefone</th>
                  <th className={`text-left px-2 md:px-4 py-3 font-semibold text-xs md:text-sm hidden lg:table-cell ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Qualidade</th>
                  <th className={`text-left px-2 md:px-4 py-3 font-semibold text-xs md:text-sm hidden lg:table-cell ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Cadastrado em</th>
                  <th className={`text-left px-2 md:px-4 py-3 font-semibold text-xs md:text-sm whitespace-nowrap ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Ações</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
                {filteredParticipants.map((participant) => (
                  <tr key={participant.id} className={darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}>
                    <td className="px-2 md:px-4 py-3">
                      <div className="flex items-center">
                        {participantImages[participant.id] ? (
                          <button
                            onClick={() => setViewingImage(participant)}
                            className="relative group"
                          >
                            <img
                              src={participantImages[participant.id]}
                              alt={`Foto de ${participant.name}`}
                              className="w-8 h-8 md:w-10 md:h-10 rounded-full object-cover border-2 border-gray-200 group-hover:border-mega-500 transition-colors"
                            />
                            <div className="absolute inset-0 rounded-full bg-black bg-opacity-0 group-hover:bg-opacity-20 flex items-center justify-center transition-opacity">
                              <span className="text-white opacity-0 group-hover:opacity-100 text-xs">👁️</span>
                            </div>
                          </button>
                        ) : (
                          <div className="w-8 h-8 md:w-10 md:h-10 bg-gray-200 rounded-full flex items-center justify-center">
                            <span className="text-gray-400 text-xs">👤</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className={`px-2 md:px-4 py-3 text-xs md:text-sm ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{participant.name}</td>
                    <td className={`px-2 md:px-4 py-3 font-mono text-xs md:text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{participant.cpf}</td>
                    <td className="px-2 md:px-4 py-3 hidden sm:table-cell">
                      {participant.approvalStatus === 'approved' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          ✅ Aprovado
                        </span>
                      ) : participant.approvalStatus === 'rejected' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          ❌ Rejeitado
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          ⏳ Pendente
                        </span>
                      )}
                    </td>
                    <td className="px-2 md:px-4 py-3 hidden md:table-cell">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-mega-100 text-mega-800">
                        {formatEventName(participant.eventCode)}
                      </span>
                    </td>
                    <td className={`px-2 md:px-4 py-3 text-sm hidden lg:table-cell ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{participant.email || '-'}</td>
                    <td className={`px-2 md:px-4 py-3 font-mono text-sm hidden lg:table-cell ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{participant.phone || '-'}</td>
                    <td className={`px-2 md:px-4 py-3 text-sm hidden lg:table-cell ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      {participant.captureQuality ?
                        `${Math.round(participant.captureQuality * 100)}%` :
                        '-'
                      }
                    </td>
                    <td className={`px-2 md:px-4 py-3 text-xs md:text-sm hidden lg:table-cell ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      {new Date(participant.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-2 md:px-4 py-3">
                      <div className="flex items-center justify-start gap-1 md:gap-2 flex-wrap">
                        {participant.approvalStatus !== 'approved' && (
                          <button
                            onClick={() => handleApprove(participant)}
                            className="px-2 md:px-3 py-1 bg-green-100 text-green-700 hover:bg-green-200 rounded text-xs font-medium transition-colors whitespace-nowrap"
                            title="Aprovar participante"
                          >
                            <span className="sm:hidden">✅</span>
                            <span className="hidden sm:inline">✅ Aprovar</span>
                          </button>
                        )}
                        {participant.approvalStatus !== 'rejected' && (
                          <button
                            onClick={() => handleReject(participant)}
                            className="px-2 md:px-3 py-1 bg-orange-100 text-orange-700 hover:bg-orange-200 rounded text-xs font-medium transition-colors whitespace-nowrap"
                            title="Rejeitar participante"
                          >
                            <span className="sm:hidden">❌</span>
                            <span className="hidden sm:inline">❌ Rejeitar</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleEdit(participant)}
                          className="px-2 md:px-3 py-1 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded text-xs font-medium transition-colors whitespace-nowrap"
                          title="Editar participante"
                        >
                          <span className="sm:hidden">✏️</span>
                          <span className="hidden sm:inline">✏️ Editar</span>
                        </button>
                        <button
                          onClick={() => handleDelete(participant.id)}
                          className="px-2 md:px-3 py-1 bg-red-100 text-red-700 hover:bg-red-200 rounded text-xs font-medium transition-colors whitespace-nowrap"
                          title="Excluir participante"
                        >
                          <span className="sm:hidden">🗑️</span>
                          <span className="hidden sm:inline">🗑️ Excluir</span>
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
              <p className={darkMode ? 'text-gray-300' : 'text-gray-500'}>Nenhum registro encontrado</p>
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
              {(editingParticipant.faceImageUrl || participantImages[editingParticipant.id]) && (
                <div className="mb-4 text-center">
                  <img 
                    src={editingParticipant.faceImageUrl || participantImages[editingParticipant.id]}
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

                {/* WhatsApp Communication Section */}
                <div className="border-t pt-4 mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    💬 Comunicação via WhatsApp
                  </label>

                  {/* Production URL Toggle */}
                  <div className="mb-3 p-3 bg-gray-50 rounded-lg">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(editingParticipant as any).useProductionUrl || false}
                        onChange={(e) => {
                          setEditingParticipant({
                            ...editingParticipant,
                            useProductionUrl: e.target.checked
                          } as any)
                        }}
                        className="w-4 h-4 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                      />
                      <span className="text-xs font-medium text-gray-700">
                        🌐 Usar domínio de produção (WhatsApp)
                      </span>
                    </label>
                    <p className="text-xs text-gray-500 mt-1 ml-6">
                      {(editingParticipant as any).useProductionUrl
                        ? '✅ Links serão clicáveis no WhatsApp'
                        : '⚠️ localhost não é clicável no WhatsApp'}
                    </p>
                  </div>

                  {/* Quick Message Templates */}
                  <div className="mb-3">
                    <p className="text-xs text-gray-500 mb-2">Templates rápidos:</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const baseUrl = (editingParticipant as any).useProductionUrl
                            ? 'https://cadastramento-mega-feira.vercel.app'
                            : window.location.origin
                          const updateUrl = `${baseUrl}/?update=${editingParticipant.id}`
                          const message = `Olá ${editingParticipant.name.split(' ')[0]}, detectamos um problema com a foto do seu cadastro.\n\n📸 Por favor, acesse o link abaixo para enviar uma nova foto:\n\n${updateUrl}\n\nSeu cadastro será atualizado automaticamente.`
                          setEditingParticipant({...editingParticipant, whatsappMessage: message})
                        }}
                        className="px-3 py-2 bg-blue-50 text-blue-700 rounded text-xs hover:bg-blue-100 transition-colors"
                      >
                        📸 Nova Foto
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const baseUrl = (editingParticipant as any).useProductionUrl
                            ? 'https://cadastramento-mega-feira.vercel.app'
                            : window.location.origin
                          const updateUrl = `${baseUrl}/?update=${editingParticipant.id}`
                          const message = `Olá ${editingParticipant.name.split(' ')[0]}, precisamos de um novo documento para completar seu cadastro.\n\n📄 Por favor, acesse o link abaixo para enviar:\n\n${updateUrl}\n\nSeu cadastro será atualizado automaticamente.`
                          setEditingParticipant({...editingParticipant, whatsappMessage: message})
                        }}
                        className="px-3 py-2 bg-green-50 text-green-700 rounded text-xs hover:bg-green-100 transition-colors"
                      >
                        📄 Novo Documento
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const message = `Olá ${editingParticipant.name.split(' ')[0]}, seu cadastro foi aprovado com sucesso! ✅\n\nAguardamos você no evento.`
                          setEditingParticipant({...editingParticipant, whatsappMessage: message})
                        }}
                        className="px-3 py-2 bg-green-50 text-green-700 rounded text-xs hover:bg-green-100 transition-colors"
                      >
                        ✅ Aprovado
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const baseUrl = (editingParticipant as any).useProductionUrl
                            ? 'https://cadastramento-mega-feira.vercel.app'
                            : window.location.origin
                          const updateUrl = `${baseUrl}/?update=${editingParticipant.id}`
                          const message = `Olá ${editingParticipant.name.split(' ')[0]}, precisamos que você atualize alguns dados do seu cadastro.\n\n📝 Acesse o link abaixo:\n\n${updateUrl}\n\nObrigado!`
                          setEditingParticipant({...editingParticipant, whatsappMessage: message})
                        }}
                        className="px-3 py-2 bg-yellow-50 text-yellow-700 rounded text-xs hover:bg-yellow-100 transition-colors"
                      >
                        ⚠️ Atualizar Dados
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const baseUrl = (editingParticipant as any).useProductionUrl
                            ? 'https://cadastramento-mega-feira.vercel.app'
                            : window.location.origin
                          const updateUrl = `${baseUrl}/?update=${editingParticipant.id}`
                          setEditingParticipant({...editingParticipant, whatsappMessage: updateUrl})
                        }}
                        className="px-3 py-2 bg-indigo-50 text-indigo-700 rounded text-xs hover:bg-indigo-100 transition-colors"
                      >
                        🔗 Apenas Link
                      </button>
                    </div>
                  </div>

                  {/* Custom Message Input */}
                  <div className="mb-3">
                    <label className="block text-xs text-gray-600 mb-1">
                      Mensagem personalizada:
                    </label>
                    <textarea
                      value={(editingParticipant as any).whatsappMessage || ''}
                      onChange={(e) => setEditingParticipant({
                        ...editingParticipant,
                        whatsappMessage: e.target.value
                      } as any)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                      rows={4}
                      placeholder="Digite sua mensagem aqui..."
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {(editingParticipant as any).whatsappMessage?.length || 0} caracteres
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-2">
                    {/* Send WhatsApp Button */}
                    <button
                      type="button"
                      onClick={() => {
                        const phone = editingParticipant.phone?.replace(/\D/g, '') || ''
                        const message = (editingParticipant as any).whatsappMessage || `Olá ${editingParticipant.name}!`

                        if (!phone) {
                          alert('Telefone não cadastrado para este participante!')
                          return
                        }

                        // Format phone: add 55 (Brazil) if not present
                        const formattedPhone = phone.startsWith('55') ? phone : `55${phone}`

                        // Encode message for URL
                        const encodedMessage = encodeURIComponent(message)

                        // Open WhatsApp Web
                        window.open(
                          `https://wa.me/${formattedPhone}?text=${encodedMessage}`,
                          '_blank'
                        )
                      }}
                      disabled={!editingParticipant.phone || !(editingParticipant as any).whatsappMessage}
                      className="w-full py-2 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <span>📱 Enviar via WhatsApp</span>
                    </button>

                    {/* Direct Link Actions */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const baseUrl = (editingParticipant as any).useProductionUrl
                            ? 'https://cadastramento-mega-feira.vercel.app'
                            : window.location.origin
                          const updateUrl = `${baseUrl}/?update=${editingParticipant.id}`
                          navigator.clipboard.writeText(updateUrl).then(() => {
                            alert('✅ Link copiado! Cole no WhatsApp ou onde desejar.')
                          }).catch(() => {
                            alert('❌ Erro ao copiar. Tente novamente.')
                          })
                        }}
                        className="py-2 bg-blue-500 text-white rounded-lg text-xs font-semibold hover:bg-blue-600 transition-colors flex items-center justify-center gap-1"
                      >
                        <span>📋 Copiar Link</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const baseUrl = (editingParticipant as any).useProductionUrl
                            ? 'https://cadastramento-mega-feira.vercel.app'
                            : window.location.origin
                          const updateUrl = `${baseUrl}/?update=${editingParticipant.id}`
                          window.open(updateUrl, '_blank')
                        }}
                        className="py-2 bg-purple-500 text-white rounded-lg text-xs font-semibold hover:bg-purple-600 transition-colors flex items-center justify-center gap-1"
                      >
                        <span>🔗 Abrir Link</span>
                      </button>
                    </div>
                  </div>

                  {!editingParticipant.phone && (
                    <p className="text-xs text-red-500 mt-2 text-center">
                      ⚠️ Telefone não cadastrado
                    </p>
                  )}
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
            <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-auto">
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

                {/* Two Column Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column - Facial Image */}
                  <div className="space-y-4">
                    <h4 className="font-semibold text-gray-800">📸 Foto Facial</h4>
                    {viewingImage.faceImageUrl || participantImages[viewingImage.id] ? (
                      <div className="text-center">
                        <img 
                          src={viewingImage.faceImageUrl || participantImages[viewingImage.id]}
                          alt={`Foto facial de ${viewingImage.name}`}
                          className="w-full h-auto rounded-lg border border-gray-200 shadow-lg"
                          style={{ maxHeight: '400px', objectFit: 'contain' }}
                        />
                      </div>
                    ) : (
                      <div className="bg-purple-100 rounded-lg p-12 text-center">
                        <div className="text-6xl font-bold text-purple-600 mb-2">
                          {viewingImage.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <p className="text-sm text-gray-500">Imagem não disponível</p>
                      </div>
                    )}
                  </div>

                  {/* Right Column - Documents */}
                  <div className="space-y-4">
                    <h4 className="font-semibold text-gray-800">📄 Documentos Enviados</h4>
                    {viewingImage.documents && Object.keys(viewingImage.documents).length > 0 ? (
                      <div className="space-y-3 max-h-[400px] overflow-y-auto">
                        {Object.entries(viewingImage.documents).map(([docType, docData]: [string, any]) => (
                          docData && (
                            <div key={docType} className="border rounded-lg p-3 hover:bg-gray-50">
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                  <p className="font-medium text-gray-700">
                                    {docType === 'rg' ? '🆔 RG (Carteira de Identidade)' : 
                                     docType === 'cnh' ? '🚗 CNH (Carteira de Motorista)' : 
                                     docType === 'cpf_doc' ? '📋 Documento com CPF' :
                                     docType === 'foto_3x4' ? '📷 Foto 3x4' :
                                     docType === 'comprovante_residencia' ? '🏠 Comprovante de Residência' :
                                     docType.toUpperCase()}
                                  </p>
                                  {docData.timestamp && (
                                    <p className="text-xs text-gray-500 mt-1">
                                      Enviado: {new Date(docData.timestamp).toLocaleString('pt-BR')}
                                    </p>
                                  )}
                                </div>
                                {docData.imageData && (
                                  <button
                                    onClick={() => {
                                      const link = document.createElement('a');
                                      link.href = docData.imageData;
                                      link.download = `${viewingImage.name.replace(/\s/g, '_')}_${docType}.jpg`;
                                      link.click();
                                    }}
                                    className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                                  >
                                    💾 Baixar
                                  </button>
                                )}
                              </div>
                              {docData.imageData && (
                                <div className="mt-2">
                                  <img 
                                    src={docData.imageData}
                                    alt={`${docType} de ${viewingImage.name}`}
                                    className="w-full h-40 object-cover rounded border cursor-pointer hover:opacity-90"
                                    onClick={() => {
                                      const win = window.open();
                                      if (win) {
                                        win.document.write(`<img src="${docData.imageData}" style="width:100%;" />`);
                                      }
                                    }}
                                    title="Clique para ampliar"
                                  />
                                </div>
                              )}
                            </div>
                          )
                        ))}
                      </div>
                    ) : (
                      <div className="bg-gray-100 rounded-lg p-8 text-center text-gray-500">
                        <div className="text-3xl mb-2">📭</div>
                        <p>Nenhum documento enviado</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Image Info - Below the columns */}
                {participantImages[viewingImage.id] && (
                  <div className="space-y-4 mt-6">

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
          {isSuperAdmin && (
            <button
              onClick={() => router.push(`/admin/eventos/${eventSlug}/fields`)}
              className="inline-flex items-center px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
            >
              🔧 Gerenciar Campos e Documentos
            </button>
          )}
          <a
            href={`/admin/eventos/${eventSlug}/stands`}
            className="inline-flex items-center px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
          >
            🏪 Gerenciar Stands
          </a>
          {isSuperAdmin && (
            <a
              href="/admin/logs"
              className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              📋 Ver Logs de Auditoria
            </a>
          )}
        </div>
      </div>
    </div>
  )
}