'use client'

import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react'
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

// ─── Layouts de ETIQUETA (rota B: config parametrizada por template) ─────────
// O gerador de PDF de participantes lê daqui. A entrada `label` (8×4) tem os números
// EXATOS de hoje → saída byte-idêntica. `label6` (6×4, SEM QR) é aditiva. Só
// participantes; o gerador de VEÍCULOS não usa isto. Ajuste fino do 6×4 é na Elgin.
type LabelStyle = 'label' | 'label6'
interface LabelLayout {
  PW: number; PH: number; stripe: number; textX: number
  showQR: boolean; align: 'left' | 'center'
  event: { font: number; y: number; maxW: number; maxWWithNum: number; numRightX: number }
  name: { font: number; wrap: number; y1: number; y2: number }
  // Auto-fit do nome (só label6): reduz a fonte medindo com getTextWidth até caber; abaixo do
  // mínimo, quebra em até maxLines. fontMax/fontMin/hardMin em pt, areaW em mm, ySingle = baseline
  // do nome quando fica em 1 linha. Ausente no 8×4 → mantém splitTextToSize fixo.
  nameFit?: { fontMax: number; fontMin: number; hardMin: number; maxLines: number; areaW: number; ySingle: number }
  stand: { font: number; wrap: number; y1: number; y2: number }
  qr?: { x: number; y: number; size: number; numX: number; numY: number; numFont: number }
}
const LABEL_LAYOUTS: Record<LabelStyle, LabelLayout> = {
  // 8×4cm — FEICAP 2026 (números idênticos ao código anterior; NÃO alterar)
  label: {
    PW: 80, PH: 40, stripe: 6, textX: 8, showQR: true, align: 'left',
    event: { font: 8, y: 9, maxW: 40, maxWWithNum: 36, numRightX: 47 },
    name: { font: 16, wrap: 40, y1: 19, y2: 26 },
    stand: { font: 9, wrap: 40, y1: 28, y2: 34 },
    qr: { x: 49, y: 5, size: 26, numX: 62, numY: 36, numFont: 7 }
  },
  // 6×4cm — SEM QR, nome PROTAGONISTA (centralizado), leitura à distância. Sem foto
  // (a família etiqueta é P&B térmica sem foto). Wraps/anchors calibráveis na Elgin.
  label6: {
    PW: 60, PH: 40, stripe: 6, textX: 8, showQR: false, align: 'center',
    event: { font: 8, y: 7, maxW: 50, maxWWithNum: 50, numRightX: 0 },
    name: { font: 24, wrap: 50, y1: 20, y2: 29 },
    // Auto-fit: 28pt (protagonista) → reduz até 14pt em 1 linha → 2 linhas a partir de 14pt →
    // piso 8pt p/ palavra única gigante. ySingle centraliza o nome grande na faixa dele.
    nameFit: { fontMax: 28, fontMin: 14, hardMin: 8, maxLines: 2, areaW: 50, ySingle: 24 },
    stand: { font: 12, wrap: 50, y1: 31, y2: 37 }
  }
}

// Auto-fit do nome no label6 (PDF): mede com jsPDF e devolve as linhas + o tamanho de fonte (pt).
// Prefere 1 linha grande; abaixo de fontMin quebra em até maxLines; reduz sob o mínimo só quando
// nem quebrando cabe (palavra única gigante / nome muito longo). NÃO é usado pelo 8×4.
type PdfLike = {
  setFont(family: string, style: string): void
  setFontSize(size: number): void
  getTextWidth(text: string): number
  splitTextToSize(text: string, maxWidth: number): string[]
}
function fitLabel6Name(
  doc: PdfLike,
  name: string,
  N: { fontMax: number; fontMin: number; hardMin: number; maxLines: number; areaW: number }
): { lines: string[]; size: number } {
  doc.setFont('helvetica', 'bold')
  // 1) uma linha — maior fonte (≥ fontMin) que couber na largura útil
  for (let s = N.fontMax; s >= N.fontMin; s--) {
    doc.setFontSize(s)
    if (doc.getTextWidth(name) <= N.areaW) return { lines: [name], size: s }
  }
  // 2) quebra em até maxLines, a partir do mínimo e reduzindo (long demais / palavra gigante)
  for (let s = N.fontMin; s >= N.hardMin; s--) {
    doc.setFontSize(s)
    const lines = doc.splitTextToSize(name, N.areaW)
    if (lines.length <= N.maxLines && lines.every(l => doc.getTextWidth(l) <= N.areaW)) {
      return { lines, size: s }
    }
  }
  // 3) piso absoluto — primeiras maxLines linhas
  doc.setFontSize(N.hardMin)
  return { lines: doc.splitTextToSize(name, N.areaW).slice(0, N.maxLines), size: N.hardMin }
}

// Nome auto-fit na PRÉVIA da tela (label6): mede o DOM e espelha o algoritmo do PDF —
// 1 linha grande primeiro, depois 2 linhas a partir do mínimo. pt→px = ×96/72 p/ bater com o PDF.
const PT_TO_PX = 96 / 72
function AutoFitName({ text }: { text: string }) {
  const fit = LABEL_LAYOUTS.label6.nameFit!
  const maxPx = fit.fontMax * PT_TO_PX
  const minPx = fit.fontMin * PT_TO_PX
  const hardPx = fit.hardMin * PT_TO_PX
  const ref = useRef<HTMLParagraphElement>(null)
  const [st, setSt] = useState<{ size: number; wrap: 'nowrap' | 'normal' }>({ size: maxPx, wrap: 'nowrap' })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fitsW = () => el.scrollWidth <= el.clientWidth + 0.5
    const lineCount = () => {
      const cs = getComputedStyle(el)
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.1
      return Math.max(1, Math.round(el.scrollHeight / lh))
    }
    // 1) uma linha, maior que couber
    el.style.whiteSpace = 'nowrap'
    for (let s = maxPx; s >= minPx; s -= 1) {
      el.style.fontSize = `${s}px`
      if (fitsW()) { setSt({ size: s, wrap: 'nowrap' }); return }
    }
    // 2) quebra em até maxLines, do mínimo p/ baixo
    el.style.whiteSpace = 'normal'
    for (let s = minPx; s >= hardPx; s -= 1) {
      el.style.fontSize = `${s}px`
      if (fitsW() && lineCount() <= fit.maxLines) { setSt({ size: s, wrap: 'normal' }); return }
    }
    setSt({ size: hardPx, wrap: 'normal' })
  }, [text, maxPx, minPx, hardPx, fit.maxLines])
  return (
    <p ref={ref} className="label-name" style={{ fontSize: `${st.size}px`, whiteSpace: st.wrap }}>
      {text}
    </p>
  )
}

// ─── Credential Card (print unit) ────────────────────────────────────────────

function CredentialCard({
  participant,
  eventName,
  templateStyle
}: {
  participant: ParticipantCredential
  eventName: string
  templateStyle: 'badge' | 'landscape' | 'label' | 'label6'
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

  if (templateStyle === 'label' || templateStyle === 'label6') {
    const isSix = templateStyle === 'label6' // 6×4: sem QR, nome protagonista centralizado
    return (
      <div className={`credential-card label${isSix ? ' label6' : ''}`}>
        {/* Left accent stripe */}
        <div className="label-stripe" />

        {/* Info */}
        <div className="label-info">
          <div className="label-top-row">
            <span className="label-event">{eventName}</span>
            {!isSix && participant.credentialNumber && (
              <span className="label-number">#{participant.credentialNumber}</span>
            )}
          </div>
          {isSix
            ? <AutoFitName text={participant.name} />
            : <p className="label-name">{participant.name}</p>}
          {standDisplay !== '—' && (
            <p className="label-stand">{standDisplay}</p>
          )}
          {grupo !== '—' && standDisplay === '—' && (
            <p className="label-stand">{grupo}</p>
          )}
        </div>

        {/* QR Code + número — só no 8×4 (label6 é sem QR) */}
        {!isSix && (
          <div className="label-qr-block">
            {participant.qrDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={participant.qrDataUrl} alt="QR" className="label-qr" />
            )}
            {participant.credentialNumber && (
              <p className="label-qr-number">#{participant.credentialNumber}</p>
            )}
          </div>
        )}
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
  const [templateStyle, setTemplateStyle] = useState<'badge' | 'landscape' | 'label' | 'label6'>('label')
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
      // 'approved' já é filtrado no servidor (via approvalStatus na query). Aqui só
      // resta o caso 'no-credential', que é exclusivamente client-side (o endpoint
      // não filtra por presença de número). 'all' passa direto.
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
      // 80 × 40 mm — formato FEICAP 2026
      const PW = 80
      const PH = 40
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [PW, PH] })

      for (let i = 0; i < targets.length; i++) {
        if (i > 0) doc.addPage([PW, PH], 'landscape')
        const v = targets[i]

        // Stripe
        doc.setFillColor(0, 0, 0)
        doc.rect(0, 0, 6, 40, 'F')

        // Event name + credential number
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(0, 0, 0)
        const evLine = doc.splitTextToSize(evName.toUpperCase(), 38)[0]
        doc.text(evLine, 8, 9)
        doc.text(v.number, 47, 9, { align: 'right' })

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
          const orientLines = doc.splitTextToSize(vehicleOrientations, 38)
          const orientY = v.plate ? 39 : 37
          doc.text(orientLines.slice(0, 2), 8, orientY)
        }

        // QR Code (x=49, y=5, 26×26mm) → borda direita em x=75mm, margem 5mm
        if (v.qrDataUrl) {
          doc.addImage(v.qrDataUrl, 'PNG', 49, 5, 26, 26)
          doc.setFontSize(7)
          doc.setFont('helvetica', 'bold')
          doc.text(v.number, 62, 36, { align: 'center' })
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
      setMessage({ type: 'success', text: `✅ PDF de ${targets.length} credencial(is) baixado!${resumeMsg} Ctrl+P → Impressora: Elgin L42PRO FULL → Tamanho do papel: 80×40mm → Escala: Tamanho real → Margens: Nenhuma.` })
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

  // ── Print via jsPDF — gera PDF 80×40mm com dimensões físicas fixas ─────────
  const handlePrint = async () => {
    if (templateStyle !== 'label' && templateStyle !== 'label6') {
      window.print()
      return
    }

    try {
      const { jsPDF } = await import('jspdf')

      const evName = selectedEvent?.name || ''

      // Layout parametrizado (config única) — 'label' = 8×4 (idêntico ao anterior),
      // 'label6' = 6×4 sem-QR com nome centralizado. Ver LABEL_LAYOUTS.
      const cfg = LABEL_LAYOUTS[templateStyle]
      const centered = cfg.align === 'center'
      const centerX = cfg.stripe + (cfg.PW - cfg.stripe) / 2
      const PW = cfg.PW
      const PH = cfg.PH
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [PW, PH] })

      for (let i = 0; i < printTargets.length; i++) {
        if (i > 0) doc.addPage([PW, PH], 'landscape')

        const p = printTargets[i]
        const standName = p.stand?.name || ''

        // ── Faixa lateral (stripe × PH) ───────────────────────────────────
        doc.setFillColor(0, 0, 0)
        doc.rect(0, 0, cfg.stripe, PH, 'F')

        doc.setTextColor(0, 0, 0)

        // ── Linha 1: nome do evento (+ #número à direita, só no 8×4) ──────
        doc.setFontSize(cfg.event.font)
        doc.setFont('helvetica', 'bold')
        const evMaxW = (!centered && p.credentialNumber) ? cfg.event.maxWWithNum : cfg.event.maxW
        const evLine = doc.splitTextToSize(evName.toUpperCase(), evMaxW)[0]
        if (centered) {
          doc.text(evLine, centerX, cfg.event.y, { align: 'center' })
        } else {
          doc.text(evLine, cfg.textX, cfg.event.y)
          if (p.credentialNumber) {
            doc.text(`#${p.credentialNumber}`, cfg.event.numRightX, cfg.event.y, { align: 'right' })
          }
        }

        // ── Nome do participante — auto-fit no label6, fixo no 8×4 ────────
        doc.setFont('helvetica', 'bold')
        let hasLine2 = false
        if (cfg.nameFit) {
          // label6: reduz a fonte até caber; 1 linha grande ou até maxLines
          const fit = fitLabel6Name(doc, p.name, cfg.nameFit)
          doc.setFontSize(fit.size)
          hasLine2 = fit.lines.length >= 2
          if (hasLine2) {
            doc.text(fit.lines[0], centerX, cfg.name.y1, { align: 'center' })
            doc.text(fit.lines[1], centerX, cfg.name.y2, { align: 'center' })
          } else {
            doc.text(fit.lines[0], centerX, cfg.nameFit.ySingle, { align: 'center' })
          }
        } else {
          // 8×4 — comportamento fixo original (NÃO alterar)
          doc.setFontSize(cfg.name.font)
          const nameLines = doc.splitTextToSize(p.name, cfg.name.wrap)
          hasLine2 = nameLines.length >= 2
          if (centered) {
            doc.text(nameLines[0], centerX, cfg.name.y1, { align: 'center' })
            if (hasLine2) doc.text(nameLines[1], centerX, cfg.name.y2, { align: 'center' })
          } else {
            doc.text(nameLines[0], cfg.textX, cfg.name.y1)
            if (hasLine2) doc.text(nameLines[1], cfg.textX, cfg.name.y2)
          }
        }

        // ── Stand ─────────────────────────────────────────────────────────
        if (standName) {
          doc.setFontSize(cfg.stand.font)
          doc.setFont('helvetica', 'bold')
          const standLine = doc.splitTextToSize(standName, cfg.stand.wrap)[0]
          const standY = hasLine2 ? cfg.stand.y2 : cfg.stand.y1
          if (centered) {
            doc.text(standLine, centerX, standY, { align: 'center' })
          } else {
            doc.text(standLine, cfg.textX, standY)
          }
        }

        // ── QR Code (só quando showQR — label6 é sem-QR) ──────────────────
        if (cfg.showQR && cfg.qr && p.qrDataUrl) {
          doc.addImage(p.qrDataUrl, 'PNG', cfg.qr.x, cfg.qr.y, cfg.qr.size, cfg.qr.size)
          if (p.credentialNumber) {
            doc.setFontSize(cfg.qr.numFont)
            doc.setFont('helvetica', 'bold')
            doc.text(`#${p.credentialNumber}`, cfg.qr.numX, cfg.qr.numY, { align: 'center' })
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
        text: `✅ PDF baixado! Ctrl+P → Impressora: Elgin L42PRO FULL → Tamanho do papel: ${PW}×${PH}mm → Escala: Tamanho real → Margens: Nenhuma → Imprimir`
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

        /* Label style — 80mm × 40mm — P&B sem foto */
        .credential-card.label {
          width: 80mm;
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
        .label-stripe { width: 5mm; background: #000; flex-shrink: 0; }
        .label-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 2.5mm 2mm 2.5mm 3mm;
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
        .label-qr-block { display: flex; flex-direction: column; align-items: center; justify-content: center; margin: 2mm 2.5mm; flex-shrink: 0; }
        .label-qr { width: 30mm; height: 30mm; display: block; }
        .label-qr-number { font-size: 9px; font-weight: 900; color: #000; text-align: center; margin: 1mm 0 0; letter-spacing: 0.5px; }
        .vehicle-number { font-size: 22px !important; letter-spacing: 1px; }

        /* Label6 style — 60mm × 40mm — sem QR, nome PROTAGONISTA centralizado */
        .credential-card.label6 { width: 60mm; }
        .credential-card.label6 .label-info {
          align-items: center;
          text-align: center;
          padding: 3mm 3mm 3mm 3mm;
          gap: 1mm;
        }
        .credential-card.label6 .label-top-row { justify-content: center; }
        .credential-card.label6 .label-event { flex: 0 1 auto; font-size: 12px; letter-spacing: 0.3px; }
        /* Tamanho da fonte e white-space vêm inline do AutoFitName (medição do DOM). */
        .credential-card.label6 .label-name {
          font-weight: 900; line-height: 1.1;
          display: block; overflow: hidden; -webkit-line-clamp: none;
          width: 100%;
        }
        .credential-card.label6 .label-stand {
          font-size: 15px; font-weight: 700;
          white-space: normal; text-overflow: clip;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        }

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
                Etiqueta 8×4cm
              </button>
              <button
                onClick={() => setTemplateStyle('label6')}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${templateStyle === 'label6' ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
              >
                Etiqueta 6×4cm
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
                <p className="font-bold text-amber-800 mb-1">🖨️ Impressão — Elgin L42PRO FULL</p>
                <p className="text-amber-700 text-xs">Ctrl+P → Impressora: <strong>Elgin L42PRO FULL</strong> → Tamanho do papel: <strong>Credencial</strong> → Escala: <strong>Tamanho real</strong> → Margens: <strong>Nenhuma</strong></p>
                <p className="text-amber-600 text-xs mt-1">⚠️ Usar outro tamanho de papel (ex: 4×6) causa etiquetas em branco entre as impressões.</p>
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
        {(templateStyle === 'label' || templateStyle === 'label6') && (
          <div className="mx-6 mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm no-print">
            <p className="font-bold text-amber-800 mb-2">🖨️ Impressão via PDF — Elgin L42PRO FULL</p>
            <ol className="text-amber-700 space-y-1 list-decimal list-inside">
              <li>Clique em <strong>Imprimir</strong> — o PDF será baixado</li>
              <li>Abra o PDF e pressione <strong>Ctrl+P</strong></li>
              <li>Impressora: <strong>Elgin L42PRO FULL</strong></li>
              <li>Tamanho do papel: <strong>Credencial</strong> — <em>obrigatório para evitar etiquetas em branco</em></li>
              <li>Escala: <strong>Tamanho real</strong> (não use "Ajustar")</li>
              <li>Margens: <strong>Nenhuma</strong> · Desmarque cabeçalhos e rodapés</li>
            </ol>
            <p className="text-red-600 mt-2 text-xs font-medium">⚠️ Usar outro tamanho de papel (ex: 4×6, 4×4) faz a impressora avançar etiquetas em branco entre cada credencial.</p>
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
            <div className={`grid gap-4 ${templateStyle === 'badge' ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5' : (templateStyle === 'label' || templateStyle === 'label6') ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
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
      <div id="print-area" ref={printAreaRef} className={(templateStyle === 'label' || templateStyle === 'label6') ? 'label-mode' : ''}>
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
