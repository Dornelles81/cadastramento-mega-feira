'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Event {
  id: string
  name: string
  code: string
  slug: string
}

interface StandInfo {
  id: string
  name: string
  code: string
  category?: string | null
  hall?: string | null
}

interface ParticipantCredential {
  id: string
  name: string
  cpf: string
  credentialNumber: string | null
  faceImageUrl?: string | null
  approvalStatus: string
  stand?: StandInfo | null
  customData?: Record<string, unknown> | null
  qrDataUrl?: string
}

interface VehicleCredential {
  id: string
  number: string
  type: string
  eventCode: string
  plate?: string | null
  qrDataUrl?: string
  credentialPrinted?: boolean
  credentialPrintedAt?: string | null
}

// ─── QR Code generation ──────────────────────────────────────────────────────

function buildCompactQR(p: ParticipantCredential, eventCode: string): string {
  // MF|SHORT_ID|CPF|EVENT|STAND|NAME — compatible with the access control scanner
  return [
    'MF',
    p.id.substring(0, 8),
    p.cpf.replace(/\D/g, ''),
    eventCode || '-',
    p.stand?.code || '-',
    p.name.substring(0, 30)
  ].join('|')
}

async function generateQR(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    width: 200,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' }
  })
}

// ─── Credential Card (print unit) ────────────────────────────────────────────

function CredentialCard({
  participant,
  eventName,
  templateStyle
}: {
  participant: ParticipantCredential
  eventName: string
  templateStyle: 'badge' | 'landscape' | 'label'
}) {
  const grupo =
    participant.stand?.category ||
    (participant.customData as Record<string, string> | null)?.grupo ||
    (participant.customData as Record<string, string> | null)?.empresa ||
    (participant.customData as Record<string, string> | null)?.group ||
    '—'

  const standDisplay = participant.stand
    ? participant.stand.name
    : '—'

  if (templateStyle === 'label') {
    return (
      <div className="credential-card label">
        {/* Left accent stripe */}
        <div className="label-stripe" />

        {/* Info */}
        <div className="label-info">
          <div className="label-top-row">
            <span className="label-event">{eventName}</span>
            {participant.credentialNumber && (
              <span className="label-number">#{participant.credentialNumber}</span>
            )}
          </div>
          <p className="label-name">{participant.name}</p>
          {standDisplay !== '—' && (
            <p className="label-stand">{standDisplay}</p>
          )}
          {grupo !== '—' && standDisplay === '—' && (
            <p className="label-stand">{grupo}</p>
          )}
        </div>

        {/* QR Code + número */}
        <div className="label-qr-block">
          {participant.qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={participant.qrDataUrl} alt="QR" className="label-qr" />
          )}
          {participant.credentialNumber && (
            <p className="label-qr-number">#{participant.credentialNumber}</p>
          )}
        </div>
      </div>
    )
  }

  if (templateStyle === 'landscape') {
    return (
      <div className="credential-card landscape">
        {/* Left stripe */}
        <div className="stripe" />

        {/* Content */}
        <div className="card-body">
          {/* Top row */}
          <div className="top-row">
            <span className="event-name">{eventName}</span>
            {participant.credentialNumber && (
              <span className="cred-number">#{participant.credentialNumber}</span>
            )}
          </div>

          {/* Middle: photo + info */}
          <div className="middle-row">
            {participant.faceImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={participant.faceImageUrl} alt="" className="participant-photo" />
            )}
            <div className="info-block">
              <p className="participant-name">{participant.name}</p>
              <p className="info-row">
                <span className="info-label">Grupo</span>
                <span className="info-value">{grupo}</span>
              </p>
              <p className="info-row">
                <span className="info-label">Stand</span>
                <span className="info-value">{standDisplay}</span>
              </p>
            </div>
          </div>
        </div>

        {/* QR Code */}
        {participant.qrDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={participant.qrDataUrl} alt="QR" className="qr-code" />
        )}
      </div>
    )
  }

  // Default: badge (vertical)
  return (
    <div className="credential-card badge">
      {/* Header */}
      <div className="badge-header">
        <span className="badge-event">{eventName}</span>
        {participant.credentialNumber && (
          <span className="badge-number">#{participant.credentialNumber}</span>
        )}
      </div>

      {/* Photo */}
      {participant.faceImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={participant.faceImageUrl} alt="" className="badge-photo" />
      )}

      {/* Name */}
      <p className="badge-name">{participant.name}</p>

      {/* Info */}
      <div className="badge-info">
        <div className="badge-info-row">
          <span className="badge-label">Grupo</span>
          <span className="badge-value">{grupo}</span>
        </div>
        <div className="badge-info-row">
          <span className="badge-label">Stand</span>
          <span className="badge-value">{standDisplay}</span>
        </div>
      </div>

      {/* QR */}
      {participant.qrDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={participant.qrDataUrl} alt="QR" className="badge-qr" />
      )}
    </div>
  )
}

// ─── Vehicle Credential Card ──────────────────────────────────────────────────

function VehicleCredentialLabel({
  credential,
  eventName,
  orientations
}: {
  credential: VehicleCredential
  eventName: string
  orientations?: string
}) {
  return (
    <div className="credential-card label">
      <div className="label-stripe" />
      <div className="label-info">
        <div className="label-top-row">
          <span className="label-event">{eventName}</span>
          <span className="label-number">{credential.number}</span>
        </div>
        <p className="label-name vehicle-number">{credential.number}</p>
        <p className="label-stand">{credential.type}</p>
        {credential.plate && (
          <p className="label-stand" style={{ fontFamily: 'monospace', letterSpacing: '1px' }}>
            🚗 {credential.plate}
          </p>
        )}
        {orientations && (
          <p className="label-orientations">{orientations}</p>
        )}
      </div>
      <div className="label-qr-block">
        {credential.qrDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={credential.qrDataUrl} alt="QR" className="label-qr" />
        )}
        <p className="label-qr-number">{credential.number}</p>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CredentialsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [mode, setMode] = useState<'participants' | 'vehicles'>('participants')

  // ── Participant state ──────────────────────────────────────────────────────
  const [events, setEvents] = useState<Event[]>([])
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [participants, setParticipants] = useState<ParticipantCredential[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [loadingQR, setLoadingQR] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'approved' | 'no-credential'>('approved')
  const [templateStyle, setTemplateStyle] = useState<'badge' | 'landscape' | 'label'>('label')
  const printAreaRef = useRef<HTMLDivElement>(null)

  // ── Vehicle state ──────────────────────────────────────────────────────────
  const VEHICLE_LIMIT = 3000
  const [vehiclePrefix, setVehiclePrefix] = useState('V')
  const [vehicleStartNumber, setVehicleStartNumber] = useState(1)
  const [vehicleQuantity, setVehicleQuantity] = useState(10)
  const [vehicleType, setVehicleType] = useState('VEÍCULO')
  const [vehicleCredentials, setVehicleCredentials] = useState<VehicleCredential[]>([])
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<Set<string>>(new Set())
  const [generatingVehicles, setGeneratingVehicles] = useState(false)
  const [loadingVehicles, setLoadingVehicles] = useState(false)
  const [editingPlateId, setEditingPlateId] = useState<string | null>(null)
  const [editingPlateValue, setEditingPlateValue] = useState('')
  const [vehicleOrientations, setVehicleOrientations] = useState('')
  const [savingOrientations, setSavingOrientations] = useState(false)
  const [vehiclePrintFilter, setVehiclePrintFilter] = useState<'all' | 'unprinted' | 'printed'>('all')

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  // ── Load events from session ──────────────────────────────────────────────
  useEffect(() => {
    if (!session) return
    const user = session.user as { role?: string; events?: Event[] }
    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
      fetch('/api/admin/eventos')
        .then(r => r.json())
        .then(data => setEvents(Array.isArray(data) ? data : data.events || []))
        .catch(() => setEvents([]))
    } else {
      setEvents(user.events || [])
    }
  }, [session])

  // ── Load participants ─────────────────────────────────────────────────────
  const loadParticipants = useCallback(async (event: Event) => {
    setLoading(true)
    setParticipants([])
    setSelectedIds(new Set())
    try {
      const params = new URLSearchParams({
        eventId: event.id,
        limit: '500',
        includeStand: 'true'
      })
      if (filterStatus === 'approved') params.set('approvalStatus', 'approved')

      const res = await fetch(`/api/admin/eventos/${event.slug}/participantes?${params}`)
      const data = await res.json()
      const list: ParticipantCredential[] = (data.participants || data || []).filter((p: ParticipantCredential) => {
        if (filterStatus === 'no-credential') return !p.credentialNumber
        return true
      })
      setParticipants(list)
    } catch {
      setMessage({ type: 'error', text: 'Erro ao carregar participantes' })
    } finally {
      setLoading(false)
    }
  }, [filterStatus])

  useEffect(() => {
    if (selectedEvent) loadParticipants(selectedEvent)
  }, [selectedEvent, loadParticipants])

  // ── Generate QR codes for visible participants ────────────────────────────
  const buildQRCodes = useCallback(async (list: ParticipantCredential[], event: Event) => {
    setLoadingQR(true)
    const updated = await Promise.all(
      list.map(async p => {
        const payload = buildCompactQR(p, event.code)
        const qrDataUrl = await generateQR(payload)
        return { ...p, qrDataUrl }
      })
    )
    setParticipants(updated)
    setLoadingQR(false)
  }, [])

  useEffect(() => {
    if (participants.length > 0 && selectedEvent && !participants[0].qrDataUrl) {
      buildQRCodes(participants, selectedEvent)
    }
  }, [participants, selectedEvent, buildQRCodes])

  // ── Generate credential numbers ───────────────────────────────────────────
  const generateCredentials = async (reset = false) => {
    if (!selectedEvent) return
    if (reset && !confirm('Isso vai resetar e renumerar TODAS as credenciais do evento. Confirma?')) return

    setGenerating(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/generate-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: selectedEvent.id, onlyApproved: filterStatus !== 'all', reset })
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: data.message })
        loadParticipants(selectedEvent)
      } else {
        setMessage({ type: 'error', text: data.error })
      }
    } catch {
      setMessage({ type: 'error', text: 'Erro ao gerar credenciais' })
    } finally {
      setGenerating(false)
    }
  }

  // ── Load vehicle credentials from DB ─────────────────────────────────────
  const loadVehicleCredentials = useCallback(async (event: Event) => {
    setLoadingVehicles(true)
    try {
      const res = await fetch(`/api/admin/vehicle-credentials?eventId=${event.id}`)
      const data = await res.json()
      const list: VehicleCredential[] = (data.credentials || []).map((c: any) => ({
        id: c.id,
        number: c.number,
        type: c.type,
        plate: c.plate,
        eventCode: event.code,
        credentialPrinted: c.credentialPrinted ?? false,
        credentialPrintedAt: c.credentialPrintedAt ?? null,
      })).sort((a: VehicleCredential, b: VehicleCredential) => {
        const numA = parseInt(a.number.replace(/\D/g, ''), 10) || 0
        const numB = parseInt(b.number.replace(/\D/g, ''), 10) || 0
        return numA - numB
      })
      // Generate QR codes
      const withQR = await Promise.all(
        list.map(async c => ({
          ...c,
          qrDataUrl: await generateQR(`VEI|${c.number}|${event.code}`)
        }))
      )
      setVehicleCredentials(withQR)
      setVehicleOrientations(data.vehicleOrientations || '')
    } catch {
      setMessage({ type: 'error', text: 'Erro ao carregar credenciais de veículo' })
    } finally {
      setLoadingVehicles(false)
    }
  }, [])

  useEffect(() => {
    if (mode === 'vehicles' && selectedEvent) {
      loadVehicleCredentials(selectedEvent)
    }
  }, [mode, selectedEvent, loadVehicleCredentials])

  // ── Save vehicle orientations ─────────────────────────────────────────────
  const saveOrientations = async () => {
    if (!selectedEvent) return
    setSavingOrientations(true)
    try {
      const res = await fetch('/api/admin/vehicle-credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: selectedEvent.id, vehicleOrientations })
      })
      if (!res.ok) throw new Error()
      setMessage({ type: 'success', text: 'Orientações salvas.' })
    } catch {
      setMessage({ type: 'error', text: 'Erro ao salvar orientações' })
    } finally {
      setSavingOrientations(false)
    }
  }

  // ── Vehicle credential generation ────────────────────────────────────────
  const generateVehicleCredentials = async () => {
    if (!selectedEvent) return
    setGeneratingVehicles(true)
    setMessage(null)
    try {
      const batch = []
      for (let i = 0; i < vehicleQuantity; i++) {
        const num = vehicleStartNumber + i
        const numStr = String(num).padStart(3, '0')
        const credNumber = vehiclePrefix ? `${vehiclePrefix}-${numStr}` : numStr
        batch.push({ number: credNumber, type: vehicleType })
      }

      const res = await fetch('/api/admin/vehicle-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: selectedEvent.id, credentials: batch })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setMessage({ type: 'success', text: `${data.count} credencial(is) salva(s) no banco.` })
      await loadVehicleCredentials(selectedEvent)
      setSelectedVehicleIds(new Set())
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao gerar credenciais' })
    } finally {
      setGeneratingVehicles(false)
    }
  }

  // ── Save plate ────────────────────────────────────────────────────────────
  const savePlate = async (id: string, plate: string) => {
    try {
      const res = await fetch(`/api/admin/vehicle-credentials/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plate: plate || null })
      })
      if (res.ok) {
        setVehicleCredentials(prev =>
          prev.map(v => v.id === id ? { ...v, plate: plate.toUpperCase() || null } : v)
        )
      }
    } catch {
      setMessage({ type: 'error', text: 'Erro ao salvar placa' })
    } finally {
      setEditingPlateId(null)
    }
  }

  // ── Delete vehicle credential ─────────────────────────────────────────────
  const deleteVehicleCredential = async (id: string) => {
    if (!confirm('Excluir esta credencial de veículo?')) return
    try {
      await fetch(`/api/admin/vehicle-credentials/${id}`, { method: 'DELETE' })
      setVehicleCredentials(prev => prev.filter(v => v.id !== id))
      setSelectedVehicleIds(prev => { const s = new Set(prev); s.delete(id); return s })
    } catch {
      setMessage({ type: 'error', text: 'Erro ao excluir' })
    }
  }

  const handlePrintVehicles = async (forceAll = false, explicitTargets?: VehicleCredential[]) => {
    let targets: VehicleCredential[]
    if (explicitTargets) {
      targets = explicitTargets
    } else if (forceAll || selectedVehicleIds.size === 0) {
      targets = vehicleCredentials
    } else {
      // Warn user: printing a subset causes blank labels between jobs on thermal printers
      const total = vehicleCredentials.length
      const selected = selectedVehicleIds.size
      if (selected < total) {
        const printAll = window.confirm(
          `⚠️ Atenção: imprimir em lotes separados desperdiça etiquetas em branco!\n\n` +
          `Você selecionou ${selected} de ${total} credencial(is).\n\n` +
          `→ Clique em OK para imprimir TODAS (${total}) em um único PDF e evitar desperdício.\n` +
          `→ Clique em Cancelar para imprimir apenas os ${selected} selecionados (pode gerar etiquetas em branco).`
        )
        targets = printAll ? vehicleCredentials : vehicleCredentials.filter(v => selectedVehicleIds.has(v.id))
      } else {
        targets = vehicleCredentials.filter(v => selectedVehicleIds.has(v.id))
      }
    }
    if (targets.length === 0) return

    try {
      const { jsPDF } = await import('jspdf')
      const evName = selectedEvent?.name || ''
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [100, 40] })

      for (let i = 0; i < targets.length; i++) {
        if (i > 0) doc.addPage([100, 40], 'landscape')
        const v = targets[i]

        // Stripe
        doc.setFillColor(0, 0, 0)
        doc.rect(0, 0, 6, 40, 'F')

        // Event name + credential number
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(0, 0, 0)
        const evLine = doc.splitTextToSize(evName.toUpperCase(), 46)[0]
        doc.text(evLine, 8, 9)
        doc.text(v.number, 62, 9, { align: 'right' })

        // Big number
        doc.setFontSize(20)
        doc.setFont('helvetica', 'bold')
        doc.text(v.number, 8, 24)

        // Type label + plate
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        const typeY = v.plate ? 30 : 34
        doc.text(v.type, 8, typeY)
        if (v.plate) {
          doc.setFontSize(8)
          doc.setFont('helvetica', 'normal')
          doc.text(v.plate, 8, 36)
        }

        // Orientações
        if (vehicleOrientations) {
          doc.setFontSize(6)
          doc.setFont('helvetica', 'normal')
          const orientLines = doc.splitTextToSize(vehicleOrientations, 54)
          const orientY = v.plate ? 39 : 37
          doc.text(orientLines.slice(0, 2), 8, orientY)
        }

        // QR Code
        if (v.qrDataUrl) {
          doc.addImage(v.qrDataUrl, 'PNG', 64, 3, 30, 30)
          doc.setFontSize(7)
          doc.setFont('helvetica', 'bold')
          doc.text(v.number, 79, 37, { align: 'center' })
        }
      }

      const blob = doc.output('blob')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `credenciais-veiculos-${Date.now()}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)

      // Mark targets as printed in the database
      const ids = targets.map(v => v.id)
      try {
        await fetch('/api/admin/mark-vehicle-printed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vehicleIds: ids })
        })
        // Update local state
        setVehicleCredentials(prev =>
          prev.map(v => ids.includes(v.id) ? { ...v, credentialPrinted: true, credentialPrintedAt: new Date().toISOString() } : v)
        )
      } catch {
        // Non-critical — PDF was already downloaded
      }

      const unprintedCount = vehicleCredentials.filter(v => !v.credentialPrinted && !ids.includes(v.id)).length
      const resumeMsg = unprintedCount > 0 ? ` · ${unprintedCount} credencial(is) ainda não impressa(s).` : ' · Todas impressas!'
      setMessage({ type: 'success', text: `✅ PDF de ${targets.length} credencial(is) baixado!${resumeMsg} Pressione Ctrl+P → Tamanho real → Margens = nenhuma.` })
    } catch (err) {
      console.error('Erro ao gerar PDF de veículos:', err)
      alert('Erro ao gerar PDF.')
    }
  }

  const toggleVehicle = (id: string) => {
    setSelectedVehicleIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Selection helpers ─────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(participants.map(p => p.id)))
  }

  const clearSelection = () => setSelectedIds(new Set())

  // ── Print via jsPDF — gera PDF 100×40mm com dimensões físicas fixas ────────
  const handlePrint = async () => {
    if (templateStyle !== 'label') {
      window.print()
      return
    }

    try {
      const { jsPDF } = await import('jspdf')

      const evName = selectedEvent?.name || ''

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [100, 40] })

      for (let i = 0; i < printTargets.length; i++) {
        if (i > 0) doc.addPage([100, 40], 'landscape')

        const p = printTargets[i]
        const standName = p.stand?.name || ''

        // ── Faixa preta (6mm × 40mm) ──────────────────────────────────────
        doc.setFillColor(0, 0, 0)
        doc.rect(0, 0, 6, 40, 'F')

        doc.setTextColor(0, 0, 0)

        // ── Linha 1: nome do evento (esq) + #número (dir) ─────────────────
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        const evMaxW = p.credentialNumber ? 46 : 54
        const evLine = doc.splitTextToSize(evName.toUpperCase(), evMaxW)[0]
        doc.text(evLine, 8, 9)
        if (p.credentialNumber) {
          doc.text(`#${p.credentialNumber}`, 62, 9, { align: 'right' })
        }

        // ── Linha 2+3: nome do participante (até 2 linhas, 16pt) ──────────
        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
        const nameLines = doc.splitTextToSize(p.name, 54)
        doc.text(nameLines[0], 8, 19)
        const hasLine2 = nameLines.length >= 2
        if (hasLine2) doc.text(nameLines[1], 8, 26)

        // ── Linha 4: stand ────────────────────────────────────────────────
        if (standName) {
          doc.setFontSize(9)
          doc.setFont('helvetica', 'bold')
          doc.text(doc.splitTextToSize(standName, 54)[0], 8, hasLine2 ? 34 : 28)
        }

        // ── QR Code (x=64, y=3, 30×30mm) ─────────────────────────────────
        if (p.qrDataUrl) {
          doc.addImage(p.qrDataUrl, 'PNG', 64, 3, 30, 30)
          if (p.credentialNumber) {
            doc.setFontSize(7)
            doc.setFont('helvetica', 'bold')
            doc.text(`#${p.credentialNumber}`, 79, 37, { align: 'center' })
          }
        }
      }

      const blob = doc.output('blob')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `credenciais-${Date.now()}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      setMessage({
        type: 'success',
        text: '✅ PDF baixado! Abra o arquivo e pressione Ctrl+P → Mais configurações → Margens = NENHUMA → desmarque CABEÇALHOS E RODAPÉS → Escala = Tamanho real → Imprimir'
      })
    } catch (err) {
      console.error('Erro ao gerar PDF:', err)
      alert('Erro ao gerar PDF de etiquetas. Verifique o console.')
    }
  }

  const selectedParticipants = participants.filter(p => selectedIds.has(p.id))
  const printTargets = selectedParticipants.length > 0 ? selectedParticipants : participants

  const filteredVehicleCredentials = vehicleCredentials.filter(v => {
    if (vehiclePrintFilter === 'unprinted') return !v.credentialPrinted
    if (vehiclePrintFilter === 'printed') return v.credentialPrinted
    return true
  })
  const unprintedVehicles = vehicleCredentials.filter(v => !v.credentialPrinted)

  if (status === 'loading') return null

  return (
    <>
      {/* ── Print CSS ─────────────────────────────────────────────────── */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #print-area { display: flex !important; }
          #print-area .no-print { display: none !important; }
        }

        /* Badge style */
        .credential-card.badge {
          width: 85mm;
          min-height: 120mm;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          overflow: hidden;
          background: white;
          display: flex;
          flex-direction: column;
          align-items: center;
          font-family: 'Arial', sans-serif;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .badge-header {
          width: 100%;
          background: #0f172a;
          color: white;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 10px;
        }
        .badge-event { font-size: 9px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; }
        .badge-number { font-size: 14px; font-weight: 900; color: #38bdf8; }
        .badge-photo { width: 70px; height: 70px; border-radius: 50%; object-fit: cover; margin: 10px auto 6px; border: 2px solid #0f172a; }
        .badge-name { font-size: 13px; font-weight: 700; color: #0f172a; text-align: center; padding: 0 8px; margin: 4px 0; line-height: 1.2; }
        .badge-info { width: 100%; padding: 0 10px 6px; }
        .badge-info-row { display: flex; gap: 4px; margin-bottom: 3px; }
        .badge-label { font-size: 8px; text-transform: uppercase; color: #64748b; font-weight: 600; min-width: 36px; }
        .badge-value { font-size: 9px; color: #0f172a; font-weight: 500; flex: 1; }
        .badge-qr { width: 70px; height: 70px; margin: 6px auto 10px; }

        /* Landscape style */
        .credential-card.landscape {
          width: 140mm;
          height: 55mm;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          overflow: hidden;
          background: white;
          display: flex;
          flex-direction: row;
          align-items: stretch;
          font-family: 'Arial', sans-serif;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .stripe { width: 8mm; background: #0f172a; flex-shrink: 0; }
        .card-body { flex: 1; padding: 6px 8px; display: flex; flex-direction: column; justify-content: space-between; }
        .top-row { display: flex; justify-content: space-between; align-items: center; }
        .event-name { font-size: 8px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.5px; }
        .cred-number { font-size: 18px; font-weight: 900; color: #0f172a; }
        .middle-row { display: flex; gap: 8px; align-items: center; flex: 1; }
        .participant-photo { width: 36mm; height: 36mm; border-radius: 4px; object-fit: cover; border: 1px solid #e2e8f0; }
        .info-block { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 4px; }
        .participant-name { font-size: 13px; font-weight: 800; color: #0f172a; line-height: 1.2; margin: 0; }
        .info-row { display: flex; gap: 4px; align-items: baseline; margin: 0; }
        .info-label { font-size: 7px; text-transform: uppercase; color: #64748b; font-weight: 700; min-width: 30px; }
        .info-value { font-size: 9px; color: #334155; }
        .qr-code { width: 44mm; height: 44mm; margin: 5mm 5mm 5mm 0; flex-shrink: 0; }

        /* Label style — 100mm × 40mm — P&B sem foto */
        .credential-card.label {
          width: 100mm;
          height: 40mm;
          border: 1px solid #000;
          border-radius: 3px;
          overflow: hidden;
          background: white;
          display: flex;
          flex-direction: row;
          align-items: stretch;
          font-family: 'Arial', sans-serif;
          page-break-inside: avoid;
          break-inside: avoid;
          box-sizing: border-box;
        }
        .label-stripe { width: 4mm; background: #000; flex-shrink: 0; }
        .label-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 2.5mm 2mm 2.5mm 4mm;
          gap: 1.5mm;
          overflow: hidden;
          min-width: 0;
        }
        .label-top-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 2mm;
        }
        .label-event {
          font-size: 16px; text-transform: uppercase; color: #000;
          font-weight: 700; letter-spacing: 0.4px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          flex: 1;
        }
        .label-number { font-size: 12px; font-weight: 900; color: #000; white-space: nowrap; flex-shrink: 0; }
        .label-name {
          font-size: 16px; font-weight: 800; color: #000;
          line-height: 1.2; margin: 0;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .label-stand { font-size: 11px; font-weight: 600; color: #000; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .label-orientations { font-size: 7px; font-weight: 500; color: #000; margin: 0; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .label-stand-label { font-weight: 700; text-transform: uppercase; font-size: 8px; }
        .label-qr-block { display: flex; flex-direction: column; align-items: center; justify-content: center; margin: 2mm 3mm; flex-shrink: 0; }
        .label-qr { width: 34mm; height: 34mm; display: block; }
        .label-qr-number { font-size: 9px; font-weight: 900; color: #000; text-align: center; margin: 1mm 0 0; letter-spacing: 0.5px; }
        .vehicle-number { font-size: 22px !important; letter-spacing: 1px; }

        /* Print layout */
        #print-area {
          display: none;
          flex-wrap: wrap;
          gap: 8mm;
          padding: 10mm;
          background: white;
        }
        #print-area.label-mode {
          display: none;
          flex-direction: column;
          gap: 2mm;
          padding: 2mm;
        }
      `}</style>

      {/* ── Screen UI ─────────────────────────────────────────────────── */}
      <div className="min-h-screen bg-slate-100 no-print">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center gap-4 no-print">
          <button onClick={() => router.push('/admin/access-control')} className="text-slate-400 hover:text-white text-sm">
            ← Controle de Acesso
          </button>
          <h1 className="text-xl font-bold">Gerador de Credenciais</h1>

          {/* Mode toggle */}
          <div className="flex bg-slate-800 rounded-lg p-1 gap-1">
            <button
              onClick={() => setMode('participants')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === 'participants' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              👤 Participantes
            </button>
            <button
              onClick={() => setMode('vehicles')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === 'vehicles' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              🚗 Veículos
            </button>
          </div>

          <div className="flex-1" />

          {mode === 'participants' && (
            <div className="flex gap-2 items-center">
              <span className="text-slate-400 text-sm">Template:</span>
              <button
                onClick={() => setTemplateStyle('label')}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${templateStyle === 'label' ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
              >
                Etiqueta 10×4cm
              </button>
              <button
                onClick={() => setTemplateStyle('badge')}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${templateStyle === 'badge' ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
              >
                Crachá
              </button>
              <button
                onClick={() => setTemplateStyle('landscape')}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${templateStyle === 'landscape' ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
              >
                Paisagem
              </button>
            </div>
          )}
        </div>

        {/* ── Vehicle mode ──────────────────────────────────────────────── */}
        {mode === 'vehicles' && (
          <>
            {/* Vehicle form */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 no-print">
              <div className="flex flex-wrap gap-4 items-end">
                {/* Event selector */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Evento</label>
                  <select
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    value={selectedEvent?.id || ''}
                    onChange={e => setSelectedEvent(events.find(ev => ev.id === e.target.value) || null)}
                  >
                    <option value="">— Selecione —</option>
                    {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                  </select>
                </div>

                {/* Prefix */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Prefixo</label>
                  <input
                    type="text"
                    value={vehiclePrefix}
                    onChange={e => setVehiclePrefix(e.target.value.toUpperCase())}
                    placeholder="V"
                    maxLength={5}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>

                {/* Start number */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nº Inicial</label>
                  <input
                    type="number"
                    min={1}
                    value={vehicleStartNumber}
                    onChange={e => setVehicleStartNumber(Math.max(1, parseInt(e.target.value) || 1))}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Quantity */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Quantidade
                    {selectedEvent && (
                      <span className={`ml-2 font-normal normal-case ${vehicleCredentials.length >= VEHICLE_LIMIT ? 'text-red-500' : 'text-slate-400'}`}>
                        ({vehicleCredentials.length}/{VEHICLE_LIMIT})
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, VEHICLE_LIMIT - vehicleCredentials.length)}
                    value={vehicleQuantity}
                    onChange={e => setVehicleQuantity(Math.min(VEHICLE_LIMIT - vehicleCredentials.length, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Type label */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</label>
                  <input
                    type="text"
                    value={vehicleType}
                    onChange={e => setVehicleType(e.target.value.toUpperCase())}
                    placeholder="VEÍCULO"
                    maxLength={20}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Preview label */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Exemplo</label>
                  <span className="font-mono text-sm bg-slate-100 px-3 py-2 rounded-lg text-slate-700">
                    {vehiclePrefix ? `${vehiclePrefix}-` : ''}{String(vehicleStartNumber).padStart(3, '0')} → {vehiclePrefix ? `${vehiclePrefix}-` : ''}{String(vehicleStartNumber + vehicleQuantity - 1).padStart(3, '0')}
                  </span>
                </div>

                <div className="flex-1" />

                {/* Actions */}
                <button
                  onClick={generateVehicleCredentials}
                  disabled={generatingVehicles || !selectedEvent || vehicleCredentials.length >= VEHICLE_LIMIT}
                  className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
                  title={vehicleCredentials.length >= VEHICLE_LIMIT ? `Limite de ${VEHICLE_LIMIT} credenciais atingido` : ''}
                >
                  {generatingVehicles ? '⏳ Gerando...' : '🚗 Gerar Credenciais'}
                </button>
                {selectedEvent && vehicleCredentials.length >= VEHICLE_LIMIT && (
                  <span className="text-xs text-red-600 font-medium">Limite de {VEHICLE_LIMIT} credenciais atingido</span>
                )}

                {vehicleCredentials.length > 0 && (
                  <>
                    <button
                      onClick={() => setSelectedVehicleIds(new Set(filteredVehicleCredentials.map(v => v.id)))}
                      className="border border-slate-300 hover:border-slate-400 px-3 py-2 rounded-lg text-sm"
                    >
                      Selecionar visíveis ({filteredVehicleCredentials.length})
                    </button>
                    {selectedVehicleIds.size > 0 && (
                      <button onClick={() => setSelectedVehicleIds(new Set())} className="text-slate-500 hover:text-slate-700 text-sm px-2">
                        ✕ Limpar
                      </button>
                    )}
                    {unprintedVehicles.length > 0 && (
                      <button
                        onClick={() => handlePrintVehicles(false, unprintedVehicles)}
                        className="bg-violet-600 hover:bg-violet-700 text-white px-5 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
                        title="Continua de onde a bobina parou — imprime somente as ainda não impressas"
                      >
                        🔄 Continuar bobina ({unprintedVehicles.length} restantes)
                      </button>
                    )}
                    <button
                      onClick={() => handlePrintVehicles(true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
                      title="Imprime todas em um único PDF — evita etiquetas em branco"
                    >
                      🖨️ Imprimir TODAS ({vehicleCredentials.length})
                    </button>
                    {selectedVehicleIds.size > 0 && (
                      <button
                        onClick={() => handlePrintVehicles(false)}
                        className="bg-sky-600 hover:bg-sky-700 text-white px-5 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
                      >
                        🖨️ Imprimir selecionados ({selectedVehicleIds.size})
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Print filter + status bar */}
            {vehicleCredentials.length > 0 && (
              <div className="mx-6 mt-3 flex flex-wrap items-center gap-3 no-print">
                {/* Filter tabs */}
                <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs font-semibold">
                  {(['all', 'unprinted', 'printed'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setVehiclePrintFilter(f)}
                      className={`px-3 py-1.5 ${vehiclePrintFilter === f ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      {f === 'all' && `Todas (${vehicleCredentials.length})`}
                      {f === 'unprinted' && `Não impressas (${unprintedVehicles.length})`}
                      {f === 'printed' && `Impressas (${vehicleCredentials.length - unprintedVehicles.length})`}
                    </button>
                  ))}
                </div>
                {/* Partial selection warning */}
                {selectedVehicleIds.size > 0 && selectedVehicleIds.size < vehicleCredentials.length && (
                  <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                    ⚠️ Seleção parcial pode desperdiçar etiquetas — prefira <strong>Continuar bobina</strong> ou <strong>Imprimir TODAS</strong>
                  </span>
                )}
              </div>
            )}

            {/* Vehicle message */}
            {message && (
              <div className={`mx-6 mt-4 p-3 rounded-lg text-sm no-print ${message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {message.type === 'success' ? '✅' : '❌'} {message.text}
              </div>
            )}

            {/* Vehicle orientations */}
            {selectedEvent && (
              <div className="mx-6 mt-4 no-print">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold text-slate-700">
                      Orientações de acesso — {selectedEvent.name}
                    </label>
                    <button
                      onClick={saveOrientations}
                      disabled={savingOrientations}
                      className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-xs font-semibold"
                    >
                      {savingOrientations ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                  <textarea
                    value={vehicleOrientations}
                    onChange={e => setVehicleOrientations(e.target.value)}
                    placeholder="Ex: Acesso permitido somente pela portaria sul. Veículos de carga devem utilizar o portão 3. Horário de carga e descarga: 06h–10h..."
                    rows={4}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Este texto fica vinculado ao evento e pode ser consultado a qualquer momento.
                  </p>
                </div>
              </div>
            )}

            {/* Vehicle print instructions */}
            {vehicleCredentials.length > 0 && (
              <div className="mx-6 mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm no-print">
                <p className="font-bold text-amber-800 mb-1">🖨️ Impressão via PDF — Elgin L42 Pro Full (100×40mm)</p>
                <p className="text-amber-700 text-xs">Ctrl+P → Tamanho real → Margens = Nenhuma → Desmarcar cabeçalhos/rodapés</p>
              </div>
            )}

            {/* Vehicle grid */}
            {(generatingVehicles || loadingVehicles) ? (
              <div className="flex items-center justify-center py-16 no-print">
                <div className="text-center text-slate-500">
                  <div className="text-4xl mb-3">⏳</div>
                  <p className="text-sm">{loadingVehicles ? 'Carregando credenciais...' : 'Gerando QR codes...'}</p>
                </div>
              </div>
            ) : vehicleCredentials.length === 0 ? (
              <div className="flex items-center justify-center py-24 no-print">
                <div className="text-center text-slate-400">
                  <div className="text-6xl mb-4">🚗</div>
                  <p className="text-lg font-medium">{selectedEvent ? 'Nenhuma credencial cadastrada para este evento' : 'Selecione um evento'}</p>
                  <p className="text-sm mt-2">Configure o formulário acima e clique em "Gerar Credenciais"</p>
                </div>
              </div>
            ) : (
              <div className="p-6 no-print">
                <p className="text-sm text-slate-500 mb-4">
                  {filteredVehicleCredentials.length === vehicleCredentials.length
                    ? `${vehicleCredentials.length} de ${VEHICLE_LIMIT} credencial(is)`
                    : `${filteredVehicleCredentials.length} de ${vehicleCredentials.length} visíveis`
                  } · {selectedVehicleIds.size > 0 ? `${selectedVehicleIds.size} selecionada(s)` : 'Clique no card para selecionar'}
                  {vehicleCredentials.length >= VEHICLE_LIMIT && (
                    <span className="ml-2 text-red-600 font-medium">— Limite atingido</span>
                  )}
                </p>
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                  {filteredVehicleCredentials.map(v => (
                    <div
                      key={v.id}
                      className={`rounded-xl overflow-hidden transition-all ${selectedVehicleIds.has(v.id) ? 'ring-2 ring-amber-500 shadow-lg' : v.credentialPrinted ? 'ring-1 ring-emerald-200 opacity-70 hover:opacity-100 hover:ring-emerald-400' : 'ring-1 ring-slate-200 hover:ring-amber-300 hover:shadow'}`}
                    >
                      <div className={`h-1 ${selectedVehicleIds.has(v.id) ? 'bg-amber-500' : v.credentialPrinted ? 'bg-emerald-400' : 'bg-transparent'}`} />
                      <div className="bg-white p-2 flex justify-center cursor-pointer" onClick={() => toggleVehicle(v.id)}>
                        <VehicleCredentialLabel credential={v} eventName={selectedEvent?.name || ''} orientations={vehicleOrientations || undefined} />
                      </div>

                      {/* Card footer: plate + actions */}
                      <div className="bg-slate-50 border-t border-slate-100 px-3 py-2 flex items-center gap-2">
                        {editingPlateId === v.id ? (
                          <input
                            autoFocus
                            type="text"
                            value={editingPlateValue}
                            onChange={e => setEditingPlateValue(e.target.value.toUpperCase())}
                            onBlur={() => savePlate(v.id, editingPlateValue)}
                            onKeyDown={e => { if (e.key === 'Enter') savePlate(v.id, editingPlateValue); if (e.key === 'Escape') setEditingPlateId(null) }}
                            placeholder="AAA-0000"
                            maxLength={10}
                            className="flex-1 text-xs font-mono border border-amber-400 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500 uppercase"
                          />
                        ) : (
                          <button
                            onClick={() => { setEditingPlateId(v.id); setEditingPlateValue(v.plate || '') }}
                            className="flex-1 text-left text-xs font-mono text-slate-600 hover:text-amber-700 transition-colors truncate"
                            title="Clique para editar a placa"
                          >
                            {v.plate ? `🚗 ${v.plate}` : <span className="text-slate-400 italic">+ Adicionar placa</span>}
                          </button>
                        )}

                        <button
                          onClick={() => deleteVehicleCredential(v.id)}
                          className="text-slate-300 hover:text-red-500 transition-colors text-xs px-1 flex-shrink-0"
                          title="Excluir"
                        >
                          ✕
                        </button>
                      </div>

                      <div className={`text-xs text-center py-1 ${selectedVehicleIds.has(v.id) ? 'bg-amber-50 text-amber-700 font-medium' : v.credentialPrinted ? 'bg-emerald-50 text-emerald-600' : 'bg-white text-slate-400'}`}>
                        {selectedVehicleIds.has(v.id) ? '✓ Selecionado para impressão' : v.credentialPrinted ? '✓ Impressa' : v.number}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Participant mode ───────────────────────────────────────────── */}
        {mode === 'participants' && (
          <>
        {/* Controls bar */}
        <div className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap gap-3 items-center no-print">
          {/* Event selector */}
          <select
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            value={selectedEvent?.id || ''}
            onChange={e => {
              const ev = events.find(ev => ev.id === e.target.value) || null
              setSelectedEvent(ev)
            }}
          >
            <option value="">— Selecione o evento —</option>
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>

          {/* Filter */}
          <select
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}
          >
            <option value="approved">Somente aprovados</option>
            <option value="all">Todos os participantes</option>
            <option value="no-credential">Sem credencial</option>
          </select>

          <div className="flex-1" />

          {/* Generate numbers */}
          {selectedEvent && (
            <>
              <button
                onClick={() => generateCredentials(false)}
                disabled={generating}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                {generating ? '⏳ Gerando...' : '🔢 Gerar Números'}
              </button>
              <button
                onClick={() => generateCredentials(true)}
                disabled={generating}
                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                🔄 Renumerar Tudo
              </button>
            </>
          )}

          {/* Selection */}
          {participants.length > 0 && (
            <>
              <button onClick={selectAll} className="border border-slate-300 hover:border-slate-400 px-3 py-2 rounded-lg text-sm">
                Selecionar todos ({participants.length})
              </button>
              {selectedIds.size > 0 && (
                <button onClick={clearSelection} className="text-slate-500 hover:text-slate-700 text-sm px-2">
                  ✕ Limpar seleção
                </button>
              )}
            </>
          )}

          {/* Print button */}
          {participants.length > 0 && (
            <button
              onClick={handlePrint}
              disabled={loadingQR}
              className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
            >
              🖨️ {selectedIds.size > 0 ? `Imprimir selecionados (${selectedIds.size})` : `Imprimir todos (${participants.length})`}
            </button>
          )}
        </div>

        {/* Instruções Elgin L42 Pro */}
        {templateStyle === 'label' && (
          <div className="mx-6 mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm no-print">
            <p className="font-bold text-amber-800 mb-2">🖨️ Impressão via PDF — Elgin L42 Pro Full</p>
            <ol className="text-amber-700 space-y-1 list-decimal list-inside">
              <li>Clique em <strong>Imprimir</strong> — um PDF de 100×40mm abrirá em nova aba</li>
              <li>No PDF, pressione <strong>Ctrl+P</strong> (o diálogo de impressão abrirá automaticamente)</li>
              <li>Selecione <strong>Elgin L42 Pro Full</strong> como impressora</li>
              <li>Tamanho do papel: <strong>100 × 40 mm</strong> (crie este tamanho personalizado no driver se necessário)</li>
              <li>Escala / Tamanho: selecione <strong>Tamanho real</strong> ou <strong>Actual size</strong> — <em>não use "Ajustar"</em></li>
              <li>Margens: <strong>Nenhuma (0)</strong> · Desmarque cabeçalhos e rodapés</li>
            </ol>
            <p className="text-amber-600 mt-2 text-xs">💡 O PDF tem as dimensões físicas 100×40mm codificadas — garante impressão sem escala independente do driver.</p>
          </div>
        )}

        {/* Message */}
        {message && (
          <div className={`mx-6 mt-4 p-3 rounded-lg text-sm no-print ${message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {message.type === 'success' ? '✅' : '❌'} {message.text}
          </div>
        )}

        {/* Loading */}
        {(loading || loadingQR) && (
          <div className="flex items-center justify-center py-16 no-print">
            <div className="text-center text-slate-500">
              <div className="text-4xl mb-3">{loading ? '⏳' : '🔲'}</div>
              <p className="text-sm">{loading ? 'Carregando participantes...' : 'Gerando QR codes...'}</p>
            </div>
          </div>
        )}

        {/* No event selected */}
        {!selectedEvent && !loading && (
          <div className="flex items-center justify-center py-24 no-print">
            <div className="text-center text-slate-400">
              <div className="text-6xl mb-4">🎫</div>
              <p className="text-lg font-medium">Selecione um evento para gerar credenciais</p>
            </div>
          </div>
        )}

        {/* Credentials grid preview */}
        {!loading && participants.length > 0 && (
          <div className="p-6 no-print">
            <p className="text-sm text-slate-500 mb-4">
              {participants.length} participante(s) · {selectedIds.size > 0 ? `${selectedIds.size} selecionado(s)` : 'Clique para selecionar'}
            </p>
            <div className={`grid gap-4 ${templateStyle === 'badge' ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5' : templateStyle === 'label' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
              {participants.map(p => (
                <div
                  key={p.id}
                  onClick={() => toggleSelect(p.id)}
                  className={`cursor-pointer rounded-xl overflow-hidden transition-all ${selectedIds.has(p.id) ? 'ring-2 ring-sky-500 shadow-lg scale-105' : 'ring-1 ring-slate-200 hover:ring-sky-300 hover:shadow'}`}
                >
                  {/* Selection indicator */}
                  <div className={`h-1 ${selectedIds.has(p.id) ? 'bg-sky-500' : 'bg-transparent'}`} />
                  <div className="bg-white p-2 flex justify-center">
                    <CredentialCard
                      participant={p}
                      eventName={selectedEvent?.name || ''}
                      templateStyle={templateStyle}
                    />
                  </div>
                  <div className={`text-xs text-center py-1 ${selectedIds.has(p.id) ? 'bg-sky-50 text-sky-700 font-medium' : 'bg-slate-50 text-slate-500'}`}>
                    {selectedIds.has(p.id) ? '✓ Selecionado' : p.credentialNumber ? `#${p.credentialNumber}` : 'Sem número'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
          </>
        )}
      </div>

      {/* ── Hidden print area ──────────────────────────────────────────── */}
      <div id="print-area" ref={printAreaRef} className={templateStyle === 'label' ? 'label-mode' : ''}>
        {printTargets.map(p => (
          <CredentialCard
            key={p.id}
            participant={p}
            eventName={selectedEvent?.name || ''}
            templateStyle={templateStyle}
          />
        ))}
      </div>
    </>
  )
}
