'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import MegaFeiraLogo from '../../../components/MegaFeiraLogo'
import jsQR from 'jsqr'

interface Participant {
  id: string
  shortId?: string
  name: string
  cpf: string
  email?: string
  phone?: string
  faceImageUrl?: string
  stand?: string
  approvalStatus?: string
  isApproved?: boolean
}

interface AccessStatus {
  isInside: boolean
  canEnter: boolean
  canExit: boolean
  lastAccess?: {
    type: string
    time: string
    gate?: string
    timeSince?: string
  }
  totalEntries: number
  totalExits: number
  totalTimeInside?: string
}

interface EventStats {
  currentInsideCount: number
  totalEntries: number
  totalExits: number
  uniqueVisitors: number
  peakCount: number
  occupancyPercentage: number
}

interface RecentActivity {
  id: string
  type: string
  time: string
  participant: {
    id: string
    name: string
    cpf: string
    faceImageUrl?: string
  }
}

interface Event {
  id: string
  name: string
  code: string
  slug: string
}

interface VehicleCredential {
  id: string
  number: string
  type: string
  plate?: string | null
}

interface VehicleAccessStatus {
  isInside: boolean
  canEnter: boolean
  canExit: boolean
  lastAccess?: { type: string; time: string; gate?: string } | null
  totalEntries: number
  totalExits: number
}

function AccessControlContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const eventSlug = searchParams.get('event')

  // State
  const [events, setEvents] = useState<Event[]>([])
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [participant, setParticipant] = useState<Participant | null>(null)
  const [accessStatus, setAccessStatus] = useState<AccessStatus | null>(null)
  const [eventStats, setEventStats] = useState<EventStats | null>(null)
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [participantsInside, setParticipantsInside] = useState<Participant[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [darkMode, setDarkMode] = useState(false)
  const [scannerActive, setScannerActive] = useState(false)
  const [scannerLoading, setScannerLoading] = useState(false)
  const [requireExitFirst, setRequireExitFirst] = useState(true)
  const [operatorName, setOperatorName] = useState('')
  const [gateName, setGateName] = useState('')
  const [forceEntry, setForceEntry] = useState(false)
  const [turboMode, setTurboMode] = useState(false)
  const [lastRegistrations, setLastRegistrations] = useState<{name: string, type: string, time: Date}[]>([])
  const [qrDetected, setQrDetected] = useState<string | null>(null)
  const [vehicle, setVehicle] = useState<VehicleCredential | null>(null)
  const [vehicleStatus, setVehicleStatus] = useState<VehicleAccessStatus | null>(null)
  const [gateType, setGateType] = useState<'ENTRADA' | 'SAÍDA' | ''>('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Check authentication
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/admin/login')
    }
  }, [status, router])

  // Load dark mode and operator settings
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDarkMode(localStorage.getItem('adminDarkMode') === 'true')
      setOperatorName(localStorage.getItem('accessControlOperator') || '')
      setGateName(localStorage.getItem('accessControlGate') || '')
      const saved = localStorage.getItem('operatorGateType') as 'ENTRADA' | 'SAÍDA' | ''
      if (saved) setGateType(saved)
    }
  }, [])

  // Load events on mount
  useEffect(() => {
    if (status === 'authenticated') {
      loadEvents()
    }
  }, [status])

  // Load event stats when event selected (less frequent in turbo mode)
  useEffect(() => {
    if (selectedEvent) {
      loadEventStats()
      // In turbo mode, refresh less frequently to save resources
      const interval = setInterval(loadEventStats, turboMode ? 30000 : 10000)
      return () => clearInterval(interval)
    }
  }, [selectedEvent, turboMode])

  // Auto-start camera for operators: on mount and after each result is cleared
  useEffect(() => {
    if (
      session?.user?.role === 'OPERATOR' &&
      !participant &&
      !vehicle &&
      !scannerActive &&
      !scannerLoading &&
      !loading
    ) {
      const timer = setTimeout(startScanner, 600)
      return () => clearTimeout(timer)
    }
  }, [session?.user?.role, participant, vehicle, scannerActive, scannerLoading, loading])

  // Auto-clear blocked states for operators so camera restarts
  // Only triggers when there is no success message (avoids false positive after check-in)
  useEffect(() => {
    if (session?.user?.role !== 'OPERATOR') return
    if (message?.type === 'success') return  // registration just succeeded — ignore
    const blockedEntry = gateType === 'ENTRADA' && (
      (participant && accessStatus?.isInside) ||
      (vehicle && vehicleStatus?.isInside)
    )
    const blockedExit = gateType === 'SAÍDA' && (
      (participant && !accessStatus?.isInside) ||
      (vehicle && !vehicleStatus?.isInside)
    )
    if (blockedEntry || blockedExit) {
      const timer = setTimeout(() => {
        setParticipant(null)
        setAccessStatus(null)
        setVehicle(null)
        setVehicleStatus(null)
        setSearchInput('')
      }, 2500)
      return () => clearTimeout(timer)
    }
  }, [participant, vehicle, accessStatus, vehicleStatus, gateType, session?.user?.role, message?.type])

  const loadEvents = async () => {
    try {
      // Use admin API to get all events (not just public/active)
      const response = await fetch('/api/admin/eventos')
      if (response.ok) {
        const data = await response.json()
        const eventsList = data.events || []

        // Map to include id, name, code, slug
        const mappedEvents = eventsList.map((e: any) => ({
          id: e.id,
          name: e.name,
          code: e.code,
          slug: e.slug
        }))

        setEvents(mappedEvents)

        // Auto-select event from URL or first active
        if (eventSlug) {
          const event = mappedEvents.find((e: Event) => e.slug === eventSlug)
          if (event) setSelectedEvent(event)
        } else if (mappedEvents.length === 1) {
          setSelectedEvent(mappedEvents[0])
        }
      }
    } catch (error) {
      console.error('Failed to load events:', error)
    }
  }

  const loadEventStats = async () => {
    if (!selectedEvent) return

    try {
      const response = await fetch(`/api/access/stats/${selectedEvent.id}`)
      if (response.ok) {
        const data = await response.json()
        setEventStats(data.stats)
        setRecentActivity(data.recentActivity || [])
        setParticipantsInside(data.participantsInside || [])
      }
    } catch (error) {
      console.error('Failed to load event stats:', error)
    }
  }

  const searchParticipant = async (query: string) => {
    if (!query.trim()) return

    // Detect vehicle QR: VEI|V-001|EVENTCODE
    if (query.startsWith('VEI|')) {
      const parts = query.split('|')
      const vNumber = parts[1]
      const vEventCode = parts[2]
      if (vNumber && vEventCode) {
        return searchVehicle(vNumber, vEventCode)
      }
    }

    // Clear vehicle state when searching participant
    setVehicle(null)
    setVehicleStatus(null)

    setLoading(true)
    setMessage(null)

    try {
      // Try to parse QR code data
      let participantId = query.trim()
      let qrEventCode: string | null = null

      // Check if it's JSON (from QR code)
      if (query.startsWith('{')) {
        try {
          const qrData = JSON.parse(query)
          participantId = qrData.id || query
          qrEventCode = qrData.event || null
        } catch {
          // Not JSON, use as is
        }
      }

      // Check if it's compact format (MF|ID|CPF|EVENT|STAND|NAME)
      if (query.startsWith('MF|')) {
        const parts = query.split('|')
        participantId = parts[1] // Short ID
        qrEventCode = parts[3] !== '-' ? parts[3] : null // Event code
      }

      // Validate QR code event matches selected event
      if (qrEventCode && selectedEvent && qrEventCode !== selectedEvent.code) {
        setMessage({
          type: 'error',
          text: `QR Code de outro evento (${qrEventCode}). Selecione o evento correto.`
        })
        setLoading(false)
        return
      }

      // Use fast API in turbo mode
      if (turboMode && selectedEvent) {
        const response = await fetch(`/api/access/fast-status?q=${participantId}&eventId=${selectedEvent.id}`)
        const data = await response.json()

        if (response.ok) {
          setParticipant({
            id: data.id,
            name: data.name,
            cpf: data.cpf,
            faceImageUrl: data.photo,
            stand: data.stand,
            approvalStatus: data.status,
            isApproved: data.isApproved
          })
          setAccessStatus({
            isInside: data.isInside,
            canEnter: data.canEnter || forceEntry,
            canExit: data.canExit || forceEntry,
            lastAccess: data.lastTime ? {
              type: data.lastType,
              time: data.lastTime,
              timeSince: ''
            } : undefined,
            totalEntries: 0,
            totalExits: 0
          })
        } else {
          setMessage({ type: 'error', text: 'Participante nao encontrado' })
          setParticipant(null)
          setAccessStatus(null)
        }
      } else {
        // Normal mode - full API (also requires eventId for segregation)
        if (!selectedEvent) {
          setMessage({ type: 'error', text: 'Selecione um evento primeiro' })
          setLoading(false)
          return
        }
        const response = await fetch(`/api/access/status/${participantId}?eventId=${selectedEvent.id}`)
        const data = await response.json()

        if (response.ok) {
          setParticipant(data.participant)
          setAccessStatus(data.accessStatus)
        } else {
          setMessage({ type: 'error', text: data.message || 'Participante nao encontrado' })
          setParticipant(null)
          setAccessStatus(null)
        }
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Erro ao buscar participante' })
    } finally {
      setLoading(false)
    }
  }

  // Turbo mode: Quick registration with auto-clear
  const turboRegister = async (type: 'ENTRY' | 'EXIT') => {
    if (!participant || !selectedEvent) {
      setMessage({ type: 'error', text: 'Selecione evento e participante' })
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/access/fast-check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId: participant.id,
          eventId: selectedEvent.id,
          type,
          gate: gateName || undefined,
          operatorName: operatorName || session?.user?.name || 'Admin'
        })
      })

      const data = await response.json()

      if (response.ok) {
        // Add to recent registrations
        setLastRegistrations(prev => [{
          name: participant.name,
          type,
          time: new Date()
        }, ...prev.slice(0, 9)])

        // Show quick success
        setMessage({
          type: 'success',
          text: `${type === 'ENTRY' ? '➡️' : '⬅️'} ${participant.name}`
        })

        // Clear and focus for next
        setParticipant(null)
        setAccessStatus(null)
        setSearchInput('')
        searchInputRef.current?.focus()

        // Update stats
        if (eventStats) {
          setEventStats({
            ...eventStats,
            currentInsideCount: eventStats.currentInsideCount + (type === 'ENTRY' ? 1 : -1),
            totalEntries: eventStats.totalEntries + (type === 'ENTRY' ? 1 : 0),
            totalExits: eventStats.totalExits + (type === 'EXIT' ? 1 : 0)
          })
        }

        // Clear message after 1.5s in turbo mode
        setTimeout(() => setMessage(null), 1500)
      } else {
        setMessage({ type: 'error', text: data.error || 'Erro no registro' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Erro de conexao' })
    } finally {
      setLoading(false)
    }
  }

  const handleCheckIn = async () => {
    if (!participant) {
      setMessage({ type: 'error', text: 'Nenhum participante selecionado' })
      return
    }
    if (!selectedEvent) {
      setMessage({ type: 'error', text: 'Selecione um evento primeiro' })
      return
    }

    setLoading(true)
    setMessage(null)

    try {
      const response = await fetch('/api/access/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId: participant.id,
          eventId: selectedEvent.id,
          gate: gateName || undefined,
          operatorName: operatorName || session?.user?.name || 'Admin',
          operatorEmail: session?.user?.email,
          requirePreviousExit: requireExitFirst,
          forceEntry: forceEntry
        })
      })

      const data = await response.json()

      if (response.ok) {
        setMessage({ type: 'success', text: `✅ ENTRADA registrada: ${participant.name}` })
        // Refresh status
        await searchParticipant(participant.id)
        await loadEventStats()
        // Clear after 3 seconds
        setTimeout(() => {
          setParticipant(null)
          setAccessStatus(null)
          setSearchInput('')
        }, 3000)
      } else {
        setMessage({ type: 'error', text: data.message || 'Erro ao registrar entrada' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Erro de conexao' })
    } finally {
      setLoading(false)
    }
  }

  const handleCheckOut = async () => {
    if (!participant) {
      setMessage({ type: 'error', text: 'Nenhum participante selecionado' })
      return
    }
    if (!selectedEvent) {
      setMessage({ type: 'error', text: 'Selecione um evento primeiro' })
      return
    }

    setLoading(true)
    setMessage(null)

    try {
      const response = await fetch('/api/access/check-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId: participant.id,
          eventId: selectedEvent.id,
          gate: gateName || undefined,
          operatorName: operatorName || session?.user?.name || 'Admin',
          operatorEmail: session?.user?.email,
          forceExit: forceEntry
        })
      })

      const data = await response.json()

      if (response.ok) {
        setMessage({
          type: 'success',
          text: `✅ SAIDA registrada: ${participant.name} (${data.duration?.formatted || ''})`
        })
        // Refresh status
        await searchParticipant(participant.id)
        await loadEventStats()
        // Clear after 3 seconds
        setTimeout(() => {
          setParticipant(null)
          setAccessStatus(null)
          setSearchInput('')
        }, 3000)
      } else {
        setMessage({ type: 'error', text: data.message || 'Erro ao registrar saida' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Erro de conexao' })
    } finally {
      setLoading(false)
    }
  }

  // Vehicle lookup by QR (VEI|number|eventCode)
  const searchVehicle = async (number: string, eventCode: string) => {
    setLoading(true)
    setMessage(null)
    setParticipant(null)
    setAccessStatus(null)
    try {
      const res = await fetch(`/api/access/vehicle-status?number=${encodeURIComponent(number)}&eventCode=${encodeURIComponent(eventCode)}`)
      const data = await res.json()
      if (res.ok) {
        setVehicle(data.vehicle)
        setVehicleStatus({
          isInside: data.isInside,
          canEnter: data.canEnter,
          canExit: data.canExit,
          lastAccess: data.lastAccess,
          totalEntries: data.totalEntries,
          totalExits: data.totalExits
        })
      } else {
        setMessage({ type: 'error', text: data.message || data.error || 'Credencial de veículo não encontrada' })
        setVehicle(null)
        setVehicleStatus(null)
      }
    } catch {
      setMessage({ type: 'error', text: 'Erro ao buscar credencial de veículo' })
    } finally {
      setLoading(false)
    }
  }

  const handleVehicleCheckIn = async () => {
    if (!vehicle || !selectedEvent) return
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/access/vehicle-check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleCredentialId: vehicle.id,
          eventId: selectedEvent.id,
          gate: gateName || undefined,
          operatorName: operatorName || session?.user?.name || 'Admin',
          requirePreviousExit: requireExitFirst
        })
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: `✅ ENTRADA registrada: ${vehicle.number} (${vehicle.type})` })
        await searchVehicle(vehicle.number, selectedEvent.code)
      } else {
        setMessage({ type: 'error', text: data.message || 'Erro ao registrar entrada' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Erro de conexão' })
    } finally {
      setLoading(false)
    }
  }

  const handleVehicleCheckOut = async () => {
    if (!vehicle || !selectedEvent) return
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/access/vehicle-check-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleCredentialId: vehicle.id,
          eventId: selectedEvent.id,
          gate: gateName || undefined,
          operatorName: operatorName || session?.user?.name || 'Admin',
          forceExit: forceEntry
        })
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: `✅ SAÍDA registrada: ${vehicle.number} (${data.duration?.formatted || ''})` })
        await searchVehicle(vehicle.number, selectedEvent.code)
      } else {
        setMessage({ type: 'error', text: data.message || 'Erro ao registrar saída' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Erro de conexão' })
    } finally {
      setLoading(false)
    }
  }

  // QR Scanner functions
  const startScanner = () => {
    // Check if mediaDevices is available (requires HTTPS)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMessage({ type: 'error', text: 'Camera nao suportada neste navegador. Use HTTPS.' })
      return
    }
    // Show video element first, then initialize camera
    setScannerLoading(true)
    setMessage({ type: 'info', text: 'Iniciando camera...' })
  }

  // Ref to track if camera is already initializing
  const cameraInitRef = useRef(false)
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize camera when video element is mounted
  useEffect(() => {
    if (!scannerLoading || !videoRef.current || cameraInitRef.current) return

    cameraInitRef.current = true

    const initCamera = async () => {
      try {
        const constraints = {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 }
          },
          audio: false
        }

        console.log('📷 Requesting camera access...')
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        console.log('✅ Camera access granted')

        if (videoRef.current && scannerLoading) {
          videoRef.current.srcObject = stream
          streamRef.current = stream

          videoRef.current.onloadedmetadata = () => {
            console.log('📹 Video metadata loaded')
            videoRef.current?.play()
              .then(() => {
                console.log('▶️ Video playing - starting QR scanner')
                setScannerActive(true)
                setScannerLoading(false)
                setMessage({ type: 'info', text: 'Camera ativa. Aponte para o QR Code.' })
                setTimeout(() => setMessage(null), 2000)

                // Start QR scanning directly here
                startQRScanning()
              })
              .catch((err) => {
                console.error('Error playing video:', err)
                cameraInitRef.current = false
                setScannerLoading(false)
                setMessage({ type: 'error', text: 'Erro ao iniciar video. Toque na tela.' })
              })
          }
        }
      } catch (error: any) {
        console.error('Camera error:', error)
        cameraInitRef.current = false
        setScannerLoading(false)
        if (error.name === 'NotAllowedError') {
          setMessage({ type: 'error', text: 'Permissao de camera negada. Verifique as configuracoes.' })
        } else if (error.name === 'NotFoundError') {
          setMessage({ type: 'error', text: 'Nenhuma camera encontrada.' })
        } else if (error.name === 'NotReadableError') {
          setMessage({ type: 'error', text: 'Camera em uso por outro aplicativo.' })
        } else {
          setMessage({ type: 'error', text: `Erro na camera: ${error.message || 'desconhecido'}` })
        }
      }
    }

    const timer = setTimeout(initCamera, 100)
    return () => clearTimeout(timer)
  }, [scannerLoading])

  // QR Scanning function
  const startQRScanning = () => {
    console.log('🔍 Starting QR code scanning...')
    let scanCount = 0

    const scanFrame = () => {
      if (!videoRef.current || !canvasRef.current || !streamRef.current) {
        console.log('❌ Scanner stopped - refs not available')
        return
      }

      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d', { willReadFrequently: true })

      if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
        scanIntervalRef.current = setTimeout(scanFrame, 100)
        return
      }

      scanCount++
      if (scanCount % 50 === 0) {
        console.log(`🔄 Scanning... (${scanCount} frames, ${video.videoWidth}x${video.videoHeight})`)
      }

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

        // Log image data info every 100 frames
        if (scanCount % 100 === 0) {
          console.log(`📊 Image data: ${imageData.width}x${imageData.height}, ${imageData.data.length} bytes`)
        }

        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth'
        })

        if (code && code.data) {
          console.log('✅ QR Code detected:', code.data)
          console.log('📍 Location:', JSON.stringify(code.location))

          if (navigator.vibrate) {
            navigator.vibrate([100, 50, 100])
          }

          // Stop scanning and process
          if (scanIntervalRef.current) {
            clearTimeout(scanIntervalRef.current)
            scanIntervalRef.current = null
          }

          stopScanner()
          setSearchInput(code.data)
          searchParticipant(code.data)
          return
        }
      } catch (err) {
        console.error('QR scan error:', err)
      }

      scanIntervalRef.current = setTimeout(scanFrame, 100)
    }

    scanFrame()
  }

  const stopScanner = () => {
    console.log('🛑 Stopping scanner...')
    // Stop scan interval
    if (scanIntervalRef.current) {
      clearTimeout(scanIntervalRef.current)
      scanIntervalRef.current = null
    }
    // Stop camera stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    // Reset states
    cameraInitRef.current = false
    setScannerActive(false)
    setScannerLoading(false)
  }

  const saveSettings = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('accessControlOperator', operatorName)
      localStorage.setItem('accessControlGate', gateName)
      setMessage({ type: 'info', text: 'Configuracoes salvas' })
      setTimeout(() => setMessage(null), 2000)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">⏳</div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    )
  }

  if (status !== 'authenticated') {
    return null
  }

  // ── Simplified operator view ─────────────────────────────────────────────
  if (session?.user?.role === 'OPERATOR') {
    return (
      <div className="h-screen bg-gray-900 flex flex-col overflow-hidden">
        {/* Compact header */}
        <div className="bg-gray-800 px-4 py-3 shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-white font-bold text-sm truncate max-w-[180px]">
                {selectedEvent?.name || 'Selecione o evento'}
              </p>
              <p className="text-gray-400 text-xs">{session.user.name}</p>
            </div>
            <select
              value={selectedEvent?.id || ''}
              onChange={(e) => {
                const ev = events.find(x => x.id === e.target.value)
                setSelectedEvent(ev || null)
              }}
              className="bg-gray-700 text-white text-xs px-2 py-1 rounded ml-2 shrink-0"
            >
              <option value="">Evento</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          </div>

          {/* Gate type toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                const v = gateType === 'ENTRADA' ? '' : 'ENTRADA'
                setGateType(v as any)
                localStorage.setItem('operatorGateType', v)
              }}
              className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${
                gateType === 'ENTRADA'
                  ? 'bg-green-500 text-white shadow-lg'
                  : 'bg-gray-700 text-gray-400'
              }`}
            >
              ➡️ ENTRADA
            </button>
            <button
              onClick={() => {
                const v = gateType === 'SAÍDA' ? '' : 'SAÍDA'
                setGateType(v as any)
                localStorage.setItem('operatorGateType', v)
              }}
              className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${
                gateType === 'SAÍDA'
                  ? 'bg-orange-500 text-white shadow-lg'
                  : 'bg-gray-700 text-gray-400'
              }`}
            >
              ⬅️ SAÍDA
            </button>
          </div>
          {!gateType && (
            <p className="text-yellow-400 text-xs text-center">⚠️ Selecione o tipo do portão acima</p>
          )}
        </div>

        {/* Camera — always visible, fills remaining height */}
        <div className="flex-1 relative bg-black min-h-0">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            onClick={() => videoRef.current?.play()}
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Initializing overlay */}
          {scannerLoading && !scannerActive && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="text-center text-white">
                <div className="text-6xl animate-pulse mb-3">📷</div>
                <p className="text-lg">Iniciando câmera...</p>
                <p className="text-sm text-gray-400 mt-1">Permita o acesso quando solicitado</p>
              </div>
            </div>
          )}

          {/* Scanning frame */}
          {scannerActive && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-64 h-64 border-2 border-green-400 rounded-xl opacity-70 animate-pulse" />
            </div>
          )}

          {/* No event selected overlay */}
          {scannerActive && !selectedEvent && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
              <div className="text-center px-8">
                <p className="text-white text-xl font-bold">Selecione um evento acima</p>
              </div>
            </div>
          )}

          {/* Message overlay */}
          {message && (
            <div className={`absolute top-4 left-4 right-4 py-4 px-4 rounded-xl text-center font-bold text-xl shadow-xl ${
              message.type === 'success' ? 'bg-green-500 text-white' :
              message.type === 'error'   ? 'bg-red-500 text-white' :
                                           'bg-blue-500 text-white'
            }`}>
              {message.text}
            </div>
          )}
        </div>

        {/* Result panel — appears after scan */}
        {(participant || vehicle) && (
          <div className={`shrink-0 p-4 border-t-4 ${
            (accessStatus?.isInside || vehicleStatus?.isInside)
              ? 'bg-amber-50 border-amber-400'
              : 'bg-white border-gray-300'
          }`}>
            {/* Participant info */}
            {participant && (
              <div className="flex items-center gap-3 mb-3">
                {participant.faceImageUrl ? (
                  <img src={participant.faceImageUrl} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-gray-200 shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center text-2xl shrink-0">👤</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-lg truncate">{participant.name}</p>
                  <p className="text-sm text-gray-500">{accessStatus?.isInside ? '📍 DENTRO' : '📍 FORA'}</p>
                  {participant.approvalStatus !== 'approved' && (
                    <p className="text-xs text-red-600 font-semibold mt-0.5">⚠️ Não aprovado</p>
                  )}
                </div>
              </div>
            )}

            {/* Vehicle info */}
            {vehicle && (
              <div className="flex items-center gap-3 mb-3">
                <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center text-3xl shrink-0">
                  {vehicle.type === 'CAMINHÃO' ? '🚛' : vehicle.type === 'VAN' ? '🚐' : '🚗'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-xl font-mono">{vehicle.number}</p>
                  <p className="text-sm text-gray-500">{vehicle.type} · {vehicleStatus?.isInside ? '📍 DENTRO' : '📍 FORA'}</p>
                  {vehicle.plate && <p className="text-xs text-gray-400">{vehicle.plate}</p>}
                </div>
              </div>
            )}

            {/* Action buttons — participant */}
            {participant && (
              <div className="flex gap-3">
                {(!gateType || gateType === 'ENTRADA') && (
                  <button onClick={handleCheckIn} disabled={loading || !accessStatus?.canEnter}
                    className={`flex-1 py-5 rounded-xl font-bold text-xl transition-all active:scale-95 ${
                      accessStatus?.canEnter && !loading ? 'bg-green-600 text-white shadow-lg' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                    {loading ? '⏳' : accessStatus?.canEnter ? '➡️ ENTRADA' : '🔒 ENTRADA'}
                  </button>
                )}
                {(!gateType || gateType === 'SAÍDA') && (
                  <button onClick={handleCheckOut} disabled={loading || !accessStatus?.canExit}
                    className={`flex-1 py-5 rounded-xl font-bold text-xl transition-all active:scale-95 ${
                      accessStatus?.canExit && !loading ? 'bg-orange-600 text-white shadow-lg' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                    {loading ? '⏳' : accessStatus?.canExit ? '⬅️ SAÍDA' : '🔒 SAÍDA'}
                  </button>
                )}
              </div>
            )}

            {/* Action buttons — vehicle */}
            {vehicle && (
              <div className="flex gap-3">
                {(!gateType || gateType === 'ENTRADA') && (
                  <button onClick={handleVehicleCheckIn} disabled={loading || !vehicleStatus?.canEnter}
                    className={`flex-1 py-5 rounded-xl font-bold text-xl transition-all active:scale-95 ${
                      vehicleStatus?.canEnter && !loading ? 'bg-green-600 text-white shadow-lg' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                    {loading ? '⏳' : vehicleStatus?.canEnter ? '➡️ ENTRADA' : '🔒 ENTRADA'}
                  </button>
                )}
                {(!gateType || gateType === 'SAÍDA') && (
                  <button onClick={handleVehicleCheckOut} disabled={loading || !vehicleStatus?.canExit}
                    className={`flex-1 py-5 rounded-xl font-bold text-xl transition-all active:scale-95 ${
                      vehicleStatus?.canExit && !loading ? 'bg-orange-600 text-white shadow-lg' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                    {loading ? '⏳' : vehicleStatus?.canExit ? '⬅️ SAÍDA' : '🔒 SAÍDA'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }
  // ── End operator view ────────────────────────────────────────────────────

  return (
    <div className={`min-h-screen p-4 ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className={`rounded-lg shadow-lg p-4 mb-4 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <MegaFeiraLogo className="text-2xl" darkMode={darkMode} />
              <div>
                <h1 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                  🚪 Controle de Acesso
                </h1>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Entrada e saida de participantes
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={selectedEvent?.id || ''}
                onChange={(e) => {
                  const event = events.find(ev => ev.id === e.target.value)
                  setSelectedEvent(event || null)
                }}
                className={`px-3 py-2 rounded-lg text-sm ${
                  darkMode ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-800'
                }`}
              >
                <option value="">Selecione o evento</option>
                {events.map(event => (
                  <option key={event.id} value={event.id}>{event.name}</option>
                ))}
              </select>
              <button
                onClick={() => router.push(`/admin/access-control/reports?event=${selectedEvent?.slug || ''}`)}
                className="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"
              >
                📊 Relatorios
              </button>
              <button
                onClick={() => router.push('/admin/access-control/credentials')}
                className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700"
              >
                🎫 Credenciais
              </button>
              <button
                onClick={() => router.back()}
                className={`px-3 py-2 rounded-lg text-sm ${
                  darkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-700'
                }`}
              >
                ← Voltar
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        {eventStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className={`rounded-lg p-4 ${darkMode ? 'bg-green-900/30 border border-green-700' : 'bg-green-50'}`}>
              <div className={`text-3xl font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                {eventStats.currentInsideCount}
              </div>
              <div className={`text-sm ${darkMode ? 'text-green-300' : 'text-green-700'}`}>
                Dentro agora
              </div>
            </div>
            <div className={`rounded-lg p-4 ${darkMode ? 'bg-blue-900/30 border border-blue-700' : 'bg-blue-50'}`}>
              <div className={`text-3xl font-bold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                {eventStats.totalEntries}
              </div>
              <div className={`text-sm ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                Total entradas
              </div>
            </div>
            <div className={`rounded-lg p-4 ${darkMode ? 'bg-orange-900/30 border border-orange-700' : 'bg-orange-50'}`}>
              <div className={`text-3xl font-bold ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                {eventStats.totalExits}
              </div>
              <div className={`text-sm ${darkMode ? 'text-orange-300' : 'text-orange-700'}`}>
                Total saidas
              </div>
            </div>
            <div className={`rounded-lg p-4 ${darkMode ? 'bg-purple-900/30 border border-purple-700' : 'bg-purple-50'}`}>
              <div className={`text-3xl font-bold ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>
                {eventStats.uniqueVisitors}
              </div>
              <div className={`text-sm ${darkMode ? 'text-purple-300' : 'text-purple-700'}`}>
                Visitantes unicos
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main Panel - Search & Actions */}
          <div className="lg:col-span-2 space-y-4">
            {/* Turbo Mode Toggle */}
            <div className={`rounded-lg shadow-sm p-3 ${turboMode ? 'bg-yellow-500' : darkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <label className={`flex items-center justify-between cursor-pointer ${turboMode ? 'text-black' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{turboMode ? '⚡' : '🐢'}</span>
                  <div>
                    <div className={`font-bold ${turboMode ? 'text-black' : darkMode ? 'text-white' : 'text-gray-800'}`}>
                      {turboMode ? 'MODO TURBO ATIVADO' : 'Modo Normal'}
                    </div>
                    <div className={`text-xs ${turboMode ? 'text-black/70' : darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {turboMode ? 'Alta velocidade - ~60 registros/min' : 'Clique para ativar modo rapido'}
                    </div>
                  </div>
                </div>
                <div className={`relative w-14 h-8 rounded-full transition-colors ${turboMode ? 'bg-yellow-700' : 'bg-gray-400'}`}>
                  <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${turboMode ? 'translate-x-7' : 'translate-x-1'}`} />
                </div>
                <input
                  type="checkbox"
                  checked={turboMode}
                  onChange={(e) => setTurboMode(e.target.checked)}
                  className="sr-only"
                />
              </label>
            </div>

            {/* Search */}
            <div className={`rounded-lg shadow-sm p-4 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <h2 className={`text-lg font-semibold mb-3 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                🔍 Buscar Participante
              </h2>
              <div className="flex gap-2">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && searchParticipant(searchInput)}
                  placeholder="ID, CPF ou escaneie o QR Code..."
                  className={`flex-1 px-4 py-3 rounded-lg text-lg ${
                    darkMode
                      ? 'bg-gray-700 text-white placeholder-gray-400 border-gray-600'
                      : 'bg-gray-100 text-gray-800 border-gray-200'
                  } border focus:ring-2 focus:ring-blue-500`}
                  autoFocus
                />
                <button
                  onClick={() => searchParticipant(searchInput)}
                  disabled={loading || !searchInput}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold"
                >
                  {loading ? '⏳' : '🔍'}
                </button>
              </div>

              {/* Scanner toggle */}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={(scannerActive || scannerLoading) ? stopScanner : startScanner}
                  disabled={scannerLoading && !scannerActive}
                  className={`px-4 py-2 rounded-lg text-sm ${
                    scannerActive || scannerLoading
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-gray-600 text-white hover:bg-gray-700'
                  } ${scannerLoading && !scannerActive ? 'opacity-50' : ''}`}
                >
                  {scannerLoading && !scannerActive
                    ? '⏳ Iniciando...'
                    : scannerActive
                      ? '📷 Parar Camera'
                      : '📷 Usar Camera'}
                </button>
                <label className={`flex items-center gap-2 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  <input
                    type="checkbox"
                    checked={requireExitFirst}
                    onChange={(e) => setRequireExitFirst(e.target.checked)}
                    className="rounded"
                  />
                  Exigir saida antes de nova entrada
                </label>
              </div>

              {/* Scanner video */}
              {(scannerLoading || scannerActive) && (
                <div className="mt-3 relative">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full rounded-lg bg-black min-h-[200px]"
                    style={{ maxHeight: '300px', objectFit: 'cover' }}
                    onClick={() => videoRef.current?.play()}
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  {/* Loading indicator */}
                  {scannerLoading && !scannerActive && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                      <div className="text-center text-white">
                        <div className="text-4xl animate-pulse mb-2">📷</div>
                        <p>Iniciando camera...</p>
                        <p className="text-xs text-gray-400 mt-1">Permita o acesso quando solicitado</p>
                      </div>
                    </div>
                  )}
                  {/* Scanning indicator */}
                  {scannerActive && (
                    <>
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-48 h-48 border-2 border-green-500 rounded-lg opacity-50 animate-pulse"></div>
                      </div>
                      <div className="absolute bottom-2 left-2 right-2 text-center">
                        <span className="bg-black/70 text-white text-xs px-2 py-1 rounded">
                          📷 Escaneando QR Code...
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Message */}
            {message && (
              <div className={`rounded-lg p-4 text-center font-semibold text-lg ${
                message.type === 'success'
                  ? 'bg-green-100 text-green-800 border-2 border-green-400'
                  : message.type === 'error'
                    ? 'bg-red-100 text-red-800 border-2 border-red-400'
                    : 'bg-blue-100 text-blue-800 border-2 border-blue-400'
              }`}>
                {message.text}
              </div>
            )}

            {/* Participant Card */}
            {participant && (
              <div className={`rounded-lg shadow-lg p-6 ${
                accessStatus?.isInside
                  ? darkMode ? 'bg-green-900/30 border-2 border-green-600' : 'bg-green-50 border-2 border-green-400'
                  : darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
              }`}>
                <div className="flex items-start gap-4">
                  {/* Photo */}
                  {participant.faceImageUrl ? (
                    <img
                      src={participant.faceImageUrl}
                      alt={participant.name}
                      className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-gray-300 flex items-center justify-center">
                      <span className="text-4xl">👤</span>
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1">
                    <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                      {participant.name}
                    </h3>
                    <p className={`font-mono ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {participant.cpf}
                    </p>
                    {participant.stand && (
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        🏪 Stand: {participant.stand}
                      </p>
                    )}

                    {/* Status Badges */}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {/* Approval Status */}
                      {participant.approvalStatus === 'approved' ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                          ✅ Aprovado
                        </span>
                      ) : participant.approvalStatus === 'rejected' ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
                          ❌ Rejeitado
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                          ⏳ Pendente
                        </span>
                      )}

                      {/* Location Status */}
                      {accessStatus?.isInside ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                          📍 DENTRO
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                          📍 FORA
                        </span>
                      )}
                    </div>

                    {/* Warning if not approved */}
                    {participant.approvalStatus !== 'approved' && (
                      <p className="text-sm mt-2 text-yellow-600 font-medium">
                        ⚠️ Participante nao aprovado - entrada bloqueada
                      </p>
                    )}

                    {accessStatus?.lastAccess && (
                      <p className={`text-sm mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        Ultimo acesso: {accessStatus.lastAccess.type === 'ENTRY' ? '➡️ Entrada' : '⬅️ Saida'} - {accessStatus.lastAccess.timeSince}
                      </p>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                {turboMode ? (
                  /* Turbo Mode: Single smart button */
                  <div className="mt-4">
                    <button
                      onClick={() => turboRegister(accessStatus?.isInside ? 'EXIT' : 'ENTRY')}
                      disabled={loading}
                      className={`w-full py-6 rounded-lg font-bold text-2xl transition-all active:scale-95 shadow-lg ${
                        accessStatus?.isInside
                          ? 'bg-orange-500 hover:bg-orange-600 text-white'
                          : 'bg-green-500 hover:bg-green-600 text-white'
                      }`}
                    >
                      {loading ? '⏳ Processando...' : (
                        accessStatus?.isInside
                          ? '⚡ REGISTRAR SAIDA'
                          : '⚡ REGISTRAR ENTRADA'
                      )}
                    </button>
                    <p className={`text-center text-sm mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {accessStatus?.isInside
                        ? 'Participante esta DENTRO - clique para registrar saida'
                        : 'Participante esta FORA - clique para registrar entrada'
                      }
                    </p>
                  </div>
                ) : (
                  /* Normal Mode: Two buttons */
                  <div className="mt-4 flex gap-3">
                    <button
                      onClick={handleCheckIn}
                      disabled={loading || (!accessStatus?.canEnter && !forceEntry)}
                      className={`flex-1 py-4 rounded-lg font-bold text-lg transition-all ${
                        accessStatus?.canEnter || forceEntry
                          ? 'bg-green-600 text-white hover:bg-green-700 shadow-lg'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      ➡️ ENTRADA
                    </button>
                    <button
                      onClick={handleCheckOut}
                      disabled={loading || (!accessStatus?.canExit && !forceEntry)}
                      className={`flex-1 py-4 rounded-lg font-bold text-lg transition-all ${
                        accessStatus?.canExit || forceEntry
                          ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-lg'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      ⬅️ SAIDA
                    </button>
                  </div>
                )}

                {/* Force entry option for admins */}
                {participant.approvalStatus !== 'approved' && (
                  <div className="mt-3">
                    <label className={`flex items-center gap-2 text-sm ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>
                      <input
                        type="checkbox"
                        checked={forceEntry}
                        onChange={(e) => setForceEntry(e.target.checked)}
                        className="rounded"
                      />
                      Forcar entrada (ignorar status de aprovacao)
                    </label>
                  </div>
                )}

                {/* Stats */}
                {accessStatus && (
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className={`p-2 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                      <div className={`font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                        {accessStatus.totalEntries}
                      </div>
                      <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Entradas</div>
                    </div>
                    <div className={`p-2 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                      <div className={`font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                        {accessStatus.totalExits}
                      </div>
                      <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Saidas</div>
                    </div>
                    <div className={`p-2 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                      <div className={`font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                        {accessStatus.totalTimeInside || '0 min'}
                      </div>
                      <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Tempo total</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Vehicle Card */}
            {vehicle && vehicleStatus && (
              <div className={`rounded-lg shadow-lg p-6 ${
                vehicleStatus.isInside
                  ? darkMode ? 'bg-amber-900/30 border-2 border-amber-500' : 'bg-amber-50 border-2 border-amber-400'
                  : darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
              }`}>
                <div className="flex items-start gap-4">
                  <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-4xl">
                      {vehicle.type === 'CAMINHÃO' ? '🚛' : vehicle.type === 'VAN' ? '🚐' : '🚗'}
                    </span>
                  </div>
                  <div className="flex-1">
                    <h3 className={`text-2xl font-bold font-mono ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                      {vehicle.number}
                    </h3>
                    <p className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      {vehicle.type}
                    </p>
                    {vehicle.plate && (
                      <p className={`text-sm font-mono mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        🚗 {vehicle.plate}
                      </p>
                    )}
                    <div className="mt-2 flex gap-2">
                      {vehicleStatus.isInside ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800">
                          📍 DENTRO
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                          📍 FORA
                        </span>
                      )}
                    </div>
                    {vehicleStatus.lastAccess && (
                      <p className={`text-sm mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        Último acesso: {vehicleStatus.lastAccess.type === 'ENTRY' ? '➡️ Entrada' : '⬅️ Saída'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={handleVehicleCheckIn}
                    disabled={loading || !vehicleStatus.canEnter}
                    className={`flex-1 py-4 rounded-lg font-bold text-lg transition-all ${
                      vehicleStatus.canEnter
                        ? 'bg-green-600 text-white hover:bg-green-700 shadow-lg'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    ➡️ ENTRADA
                  </button>
                  <button
                    onClick={handleVehicleCheckOut}
                    disabled={loading || (!vehicleStatus.canExit && !forceEntry)}
                    className={`flex-1 py-4 rounded-lg font-bold text-lg transition-all ${
                      vehicleStatus.canExit || forceEntry
                        ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-lg'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    ⬅️ SAÍDA
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                  <div className={`p-2 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                    <div className={`font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>{vehicleStatus.totalEntries}</div>
                    <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Entradas</div>
                  </div>
                  <div className={`p-2 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                    <div className={`font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>{vehicleStatus.totalExits}</div>
                    <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Saídas</div>
                  </div>
                </div>
              </div>
            )}

            {/* Turbo Mode - Recent Registrations */}
            {turboMode && lastRegistrations.length > 0 && (
              <div className={`rounded-lg shadow-sm p-4 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                <h3 className={`text-sm font-semibold mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  ⚡ Ultimos Registros ({lastRegistrations.length})
                </h3>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {lastRegistrations.map((reg, idx) => (
                    <div key={idx} className={`flex items-center justify-between text-sm py-1 px-2 rounded ${
                      reg.type === 'ENTRY'
                        ? darkMode ? 'bg-green-900/30' : 'bg-green-50'
                        : darkMode ? 'bg-orange-900/30' : 'bg-orange-50'
                    }`}>
                      <span className={darkMode ? 'text-white' : 'text-gray-800'}>
                        {reg.type === 'ENTRY' ? '➡️' : '⬅️'} {reg.name}
                      </span>
                      <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {reg.time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Settings */}
            <div className={`rounded-lg shadow-sm p-4 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <h3 className={`text-sm font-semibold mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                ⚙️ Configuracoes do Operador
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  placeholder="Nome do operador"
                  className={`px-3 py-2 rounded text-sm ${
                    darkMode ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-800'
                  }`}
                />
                <input
                  type="text"
                  value={gateName}
                  onChange={(e) => setGateName(e.target.value)}
                  placeholder="Portao/Local"
                  className={`px-3 py-2 rounded text-sm ${
                    darkMode ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-800'
                  }`}
                />
              </div>
              <button
                onClick={saveSettings}
                className="mt-2 px-4 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
              >
                Salvar
              </button>
            </div>
          </div>

          {/* Side Panel - Activity & Inside List */}
          <div className="space-y-4">
            {/* Participants Inside */}
            <div className={`rounded-lg shadow-sm p-4 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <h3 className={`text-sm font-semibold mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                👥 Dentro do Evento ({participantsInside.length})
              </h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {participantsInside.length === 0 ? (
                  <p className={`text-sm text-center py-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    Nenhum participante dentro
                  </p>
                ) : (
                  participantsInside.map(p => (
                    <div
                      key={p.id}
                      onClick={() => searchParticipant(p.id)}
                      className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                        darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                      }`}
                    >
                      {p.faceImageUrl ? (
                        <img src={p.faceImageUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-xs">👤</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                          {p.name}
                        </p>
                        <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {p.stand || p.cpf}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Recent Activity */}
            <div className={`rounded-lg shadow-sm p-4 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <h3 className={`text-sm font-semibold mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                📋 Atividade Recente
              </h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {recentActivity.length === 0 ? (
                  <p className={`text-sm text-center py-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    Nenhuma atividade
                  </p>
                ) : (
                  recentActivity.map(activity => (
                    <div
                      key={activity.id}
                      className={`flex items-center gap-2 p-2 rounded ${
                        activity.type === 'ENTRY'
                          ? darkMode ? 'bg-green-900/20' : 'bg-green-50'
                          : darkMode ? 'bg-orange-900/20' : 'bg-orange-50'
                      }`}
                    >
                      <span className="text-lg">
                        {activity.type === 'ENTRY' ? '➡️' : '⬅️'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                          {activity.participant.name}
                        </p>
                        <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {new Date(activity.time).toLocaleTimeString('pt-BR')}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AccessControlPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">⏳</div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    }>
      <AccessControlContent />
    </Suspense>
  )
}
