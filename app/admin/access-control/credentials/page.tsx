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
  templateStyle: 'badge' | 'landscape'
}) {
  const grupo =
    participant.stand?.category ||
    (participant.customData as Record<string, string> | null)?.grupo ||
    (participant.customData as Record<string, string> | null)?.empresa ||
    (participant.customData as Record<string, string> | null)?.group ||
    '—'

  const standDisplay = participant.stand
    ? `${participant.stand.code} · ${participant.stand.name}`
    : '—'

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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CredentialsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [events, setEvents] = useState<Event[]>([])
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [participants, setParticipants] = useState<ParticipantCredential[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [loadingQR, setLoadingQR] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'approved' | 'no-credential'>('approved')
  const [templateStyle, setTemplateStyle] = useState<'badge' | 'landscape'>('badge')
  const printAreaRef = useRef<HTMLDivElement>(null)

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

  // ── Print ─────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    window.print()
  }

  const selectedParticipants = participants.filter(p => selectedIds.has(p.id))
  const printTargets = selectedParticipants.length > 0 ? selectedParticipants : participants

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

        /* Print layout */
        #print-area {
          display: none;
          flex-wrap: wrap;
          gap: 8mm;
          padding: 10mm;
          background: white;
        }
      `}</style>

      {/* ── Screen UI ─────────────────────────────────────────────────── */}
      <div className="min-h-screen bg-slate-100 no-print">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center gap-4 no-print">
          <button onClick={() => router.push('/admin/access-control')} className="text-slate-400 hover:text-white text-sm">
            ← Controle de Acesso
          </button>
          <h1 className="text-xl font-bold flex-1">Gerador de Credenciais</h1>
          <div className="flex gap-2 items-center">
            <span className="text-slate-400 text-sm">Template:</span>
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
        </div>

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
            <div className={`grid gap-4 ${templateStyle === 'badge' ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5' : 'grid-cols-1 md:grid-cols-2'}`}>
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
      </div>

      {/* ── Hidden print area ──────────────────────────────────────────── */}
      <div id="print-area" ref={printAreaRef}>
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
