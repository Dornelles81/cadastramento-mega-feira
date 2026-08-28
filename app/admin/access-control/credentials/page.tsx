'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import { carregarMedidor, medidorCarregado, type Medidor } from '@/lib/medir-texto'

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

// Contagem por stand vinda do groupBy do servidor — alimenta o rótulo do dropdown.
interface StandCount {
  id: string
  name: string
  code: string
  count: number
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
  // label6 — hierarquia do nome em 2 blocos, ambos em 1 linha e com baseline FIXA (etiquetas
  // uniformes na pilha). firstFit = PRIMEIRO NOME em destaque; restFit = restante, menor.
  // `ySolo` = baseline do primeiro nome quando não há restante (nome de um token só): sobe o
  // bloco para ele não ficar solto no alto. fontMax/fontMin/step em pt, areaW/y em mm.
  firstFit?: { fontMax: number; fontMin: number; step: number; areaW: number; y: number; ySolo: number }
  restFit?: { fontMax: number; fontMin: number; step: number; areaW: number; y: number }
  stand: { font: number; wrap: number; y1: number; y2: number }
  // Auto-fit do stand (só label6): reduz a fonte em passos de `step` até caber em maxLines e
  // ancora o bloco pela ÚLTIMA linha em `bottom` (mm) — é isso que impede a 2ª linha de cair
  // fora da etiqueta. `topLimit` é o teto do bloco (mm): o stand reduz a fonte em vez de subir
  // sobre o nome. Se nem no piso couber em maxLines, libera até maxLinesHard linhas — a fonte
  // NUNCA desce de fontMin. fontMax/fontMin/step em pt, areaW/bottom/topLimit em mm.
  standFit?: { fontMax: number; fontMin: number; step: number; maxLines: number; maxLinesHard: number; areaW: number; bottom: number; topLimit: number }
  qr?: { x: number; y: number; size: number; numX: number; numY: number; numFont: number }
}
// pt → mm: jsPDF mede fonte sempre em pt, mas os documentos aqui são unit:'mm'.
const PT_TO_MM = 0.3528

// ─── Área útil horizontal do 6×4 ────────────────────────────────────────────
// A margem NÃO é estética: a área imprimível da 4B-2074B é menor que os 60mm nominais. Com
// 4pt de margem o stand mais largo ("ASSOCIACAO DOS CRIADORES…", 56.48mm) saiu encostando na
// borda direita no papel. 7pt por lado é o offset medido na impressão real. Vale para os TRÊS
// blocos — cabeçalho, nome e stand: o recuo é da impressora, não do texto.
const L6_PW = 60
const L6_MARGIN = 7 * PT_TO_MM // 2.47mm
const L6_AREA_W = Math.round((L6_PW - 2 * L6_MARGIN) * 100) / 100 // 55.06mm

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
    // stripe 0 = SEM faixa preta. Sem ela o conteúdo é centralizado no centro REAL da
    // página (centerX = PW/2 = 30mm); com a faixa ele ficava 3mm torto para a direita.
    PW: L6_PW, PH: 40, stripe: 0, textX: 8, showQR: false, align: 'center',
    // Os três blocos compartilham L6_AREA_W — ver o comentário da constante.
    event: { font: 8, y: 7, maxW: L6_AREA_W, maxWWithNum: L6_AREA_W, numRightX: 0 },
    // name.{font,wrap,y1,y2} não é usado no label6 (firstFit/restFit mandam); fica só como
    // fallback do tipo.
    name: { font: 24, wrap: L6_AREA_W, y1: 20, y2: 29 },
    // Hierarquia: PRIMEIRO NOME grande na baseline 22.0 (25.0 se não houver sobrenome) e o
    // restante menor na 28.5. Baselines FIXAS — etiquetas diferentes ficam alinhadas na pilha.
    // A PRÉVIA da tela lê estas mesmas constantes (o card é desenhado em tamanho físico real).
    firstFit: { fontMax: 26, fontMin: 13, step: 0.25, areaW: L6_AREA_W, y: 22, ySolo: 25 },
    restFit: { fontMax: 12, fontMin: 7, step: 0.25, areaW: L6_AREA_W, y: 28.5 },
    // stand.{font,wrap,y1,y2} não são usados no label6 (standFit manda); ficam só como
    // fallback do tipo. Calibração do stand é em standFit.
    stand: { font: 12, wrap: L6_AREA_W, y1: 31, y2: 37 },
    // bottom = baseline da última linha, a 2.8mm da borda (térmica direta; 0.8mm era apertado
    // demais). topLimit 30.5 deixa ≥ 1.07mm do descendente do restante do nome (29.43mm a 12pt).
    // fontMin 6pt é PISO RÍGIDO: a 203 dpi a Helvetica-Bold abaixo disso fecha os contornos na
    // térmica — por isso libera a 3ª linha antes de reduzir mais.
    standFit: { fontMax: 12, fontMin: 6, step: 0.25, maxLines: 2, maxLinesHard: 3, areaW: L6_AREA_W, bottom: 37.2, topLimit: 30.5 }
  }
}

// Cache do auto-fit: a chave é (texto + a config que decide o encaixe). Dentro de um stand o
// nome do stand é IDÊNTICO para todos os participantes — sem isto, imprimir 300 etiquetas
// refazia 300 vezes a mesma varredura de 12pt a 6pt medindo no jsPDF. Os primeiros nomes
// repetidos (Maria, João) também caem aqui. Vive no módulo: sobrevive entre impressões.
const cacheFit = new Map<string, unknown>()
function memoFit<T>(escopo: string, texto: string, cfg: object, calcular: () => T): T {
  const chave = `${escopo}\u0000${texto}\u0000${JSON.stringify(cfg)}`
  const guardado = cacheFit.get(chave)
  if (guardado !== undefined) return guardado as T
  const valor = calcular()
  cacheFit.set(chave, valor)
  return valor
}

// Divisão do nome no label6: token[0] = primeiro nome (bloco em destaque), token[1..] juntos =
// restante. Espaços múltiplos são descartados. REGRA ISOLADA de propósito — para mudar para
// "primeiro + último sobrenome" basta mexer aqui.
function splitNome(name: string): { first: string; rest: string } {
  const tokens = name.trim().split(/\s+/).filter(Boolean)
  return { first: tokens[0] || '', rest: tokens.slice(1).join(' ') }
}

// Auto-fit de UMA linha por largura (blocos do nome no label6): maior fonte entre fontMax e
// fontMin que couber em areaW. No piso, trunca com … — o bloco nunca some nem estoura.
// `m` é a régua compartilhada (lib/medir-texto): o PDF e a prévia chamam esta MESMA função.
function fitLinhaUnica(
  m: Medidor,
  text: string,
  F: { fontMax: number; fontMin: number; step: number; areaW: number }
): { line: string; size: number } {
  return memoFit('linha', text, F, () => calcularLinhaUnica(m, text, F))
}
function calcularLinhaUnica(
  m: Medidor,
  text: string,
  F: { fontMax: number; fontMin: number; step: number; areaW: number }
): { line: string; size: number } {
  for (let s = F.fontMax; s >= F.fontMin; s -= F.step) {
    if (m.largura(text, s) <= F.areaW) return { line: text, size: s }
  }
  if (m.largura(text, F.fontMin) <= F.areaW) return { line: text, size: F.fontMin }
  let line = text
  while (line.length > 1 && m.largura(line.replace(/\s+$/, '') + '…', F.fontMin) > F.areaW) {
    line = line.slice(0, -1)
  }
  return { line: line.replace(/\s+$/, '') + '…', size: F.fontMin }
}

// Proporção da Helvetica para medir ALTURA (jsPDF só expõe largura): a caixa alta sobe ≈ 0.717 em
// acima da baseline (o descendente desce ≈ 0.22 em, usado só nas contas de folga do layout).
const CAP_RATIO = 0.717

// Auto-fit do stand no label6 (PDF): reduz a fonte até o texto caber em LARGURA (maxLines linhas)
// E em ALTURA — o topo do bloco não pode passar de `topLimit`. Como o stand é ancorado no rodapé,
// sem o teto ele subiria por cima do nome. Ordem das concessões: reduzir fonte até fontMin →
// liberar a 3ª linha (maxLinesHard) e reduzir de novo → truncar com …. A fonte NUNCA vai abaixo
// de fontMin (203 dpi na térmica). `m` é a régua compartilhada — o PDF e a prévia chamam esta
// MESMA função, com o mesmo instrumento de medida. Não é usado no 8×4.
function fitLabel6Stand(
  m: Medidor,
  text: string,
  S: {
    fontMax: number; fontMin: number; step: number
    maxLines: number; maxLinesHard: number; areaW: number; bottom: number; topLimit: number
  }
): { lines: string[]; size: number } {
  return memoFit('stand', text, S, () => calcularLabel6Stand(m, text, S))
}
function calcularLabel6Stand(
  m: Medidor,
  text: string,
  S: {
    fontMax: number; fontMin: number; step: number
    maxLines: number; maxLinesHard: number; areaW: number; bottom: number; topLimit: number
  }
): { lines: string[]; size: number } {
  // topo do bloco = baseline da 1ª linha − altura de caixa alta
  const blockTop = (size: number, n: number) =>
    S.bottom - (n - 1) * (size * 1.15 * PT_TO_MM) - size * CAP_RATIO * PT_TO_MM

  for (const limite of [S.maxLines, S.maxLinesHard]) {
    for (let size = S.fontMax; size >= S.fontMin; size -= S.step) {
      const lines = m.quebrar(text, size, S.areaW)
      if (lines.length <= limite && blockTop(size, lines.length) >= S.topLimit) return { lines, size }
    }
  }

  // Rede de segurança: no piso da fonte, corta no nº de linhas que ainda cabe na vertical
  // (mínimo 1) e trunca a última com … .
  const size = S.fontMin
  let lines = m.quebrar(text, size, S.areaW)
  let allowed = S.maxLinesHard
  while (allowed > 1 && blockTop(size, allowed) < S.topLimit) allowed--
  if (lines.length > allowed) {
    lines = lines.slice(0, allowed)
    lines[allowed - 1] = lines[allowed - 1].replace(/\s*\S*$/, '…')
  }
  return { lines, size }
}

// ─── PRÉVIA da tela do label6 — espelho do PDF ───────────────────────────────
// O card é desenhado em tamanho físico real (60mm × 40mm), então a prévia usa as MESMAS
// constantes em mm/pt de LABEL_LAYOUTS.label6 e as MESMAS funções de fit — medindo pela mesma
// régua (lib/medir-texto). O navegador não decide nada: recebe o tamanho e as linhas prontos e
// só desenha. mm→px é o próprio CSS; pt→px = ×96/72.
const PT_TO_PX = 96 / 72
// Métrica da Helvetica/Arial com line-height 1, em `em`: distância do topo da caixa de linha
// até a baseline (ascender 0.905 + meio-entrelinha −0.059). Usada no calc() para ancorar cada
// linha pela BASELINE, como no PDF — o navegador posiciona caixas, não baselines.
const ASCENT_EM = 0.8467

// Régua compartilhada com o gerador. Carrega uma vez por sessão (import dinâmico do jsPDF);
// até chegar, os blocos não são desenhados — melhor um tick vazio do que um tamanho errado.
function useMedidor(): Medidor | null {
  const [m, setM] = useState<Medidor | null>(() => medidorCarregado())
  useEffect(() => {
    if (m) return
    let vivo = true
    carregarMedidor().then(medidor => { if (vivo) setM(medidor) })
    return () => { vivo = false }
  }, [m])
  return m
}

// Folga de 1px na caixa de DESENHO (não na medição). A Arial Bold real é ~1% mais larga que a
// tabela Helvetica do jsPDF, e clientWidth/scrollWidth são arredondados para pixel inteiro; sem
// essa folga um texto que o fit aprovou por 0.2mm pode disparar o text-overflow. O … do CSS fica
// só para descompasso grosseiro (fonte trocada), não para ruído de métrica.
const TOLERANCIA_DESENHO = '1px'

// Uma linha do nome: fitLinhaUnica() decide fonte e texto (com … no piso); o <p> só desenha.
function AutoFitLine({
  medidor,
  text,
  fit,
  baseline,
  className
}: {
  medidor: Medidor
  text: string
  fit: { fontMax: number; fontMin: number; step: number; areaW: number }
  baseline: number
  className: string
}) {
  const { line, size } = fitLinhaUnica(medidor, text, fit)
  return (
    <p
      className={className}
      style={{
        fontSize: `${size * PT_TO_PX}px`,
        width: `calc(${fit.areaW}mm + ${TOLERANCIA_DESENHO})`,
        top: `calc(${baseline}mm - ${ASCENT_EM}em)`
      }}
    >
      {line}
    </p>
  )
}

// Stand: fitLabel6Stand() devolve as linhas já quebradas e o tamanho; cada linha vira um <p>
// na SUA baseline (a última em `bottom`, as demais subindo de lineH) — igual ao PDF.
function AutoFitStand({
  medidor,
  text,
  fit
}: {
  medidor: Medidor
  text: string
  fit: {
    fontMax: number; fontMin: number; step: number
    maxLines: number; maxLinesHard: number; areaW: number; bottom: number; topLimit: number
  }
}) {
  const { lines, size } = fitLabel6Stand(medidor, text, fit)
  const lineH = size * 1.15 * PT_TO_MM
  return (
    <>
      {lines.map((l, i) => (
        <p
          key={i}
          className="label6-stand"
          style={{
            fontSize: `${size * PT_TO_PX}px`,
            width: `calc(${fit.areaW}mm + ${TOLERANCIA_DESENHO})`,
            top: `calc(${fit.bottom - (lines.length - 1 - i) * lineH}mm - ${ASCENT_EM}em)`
          }}
        >
          {l}
        </p>
      ))}
    </>
  )
}

// Card 6×4 na tela — espelho do PDF: 3 blocos ancorados pela baseline, nas mesmas medidas em
// mm da config, decididos pelas mesmas funções de fit. splitNome() é A MESMA do gerador.
function Label6Card({
  name,
  eventName,
  standText
}: {
  name: string
  eventName: string
  standText: string
}) {
  const medidor = useMedidor()
  const L = LABEL_LAYOUTS.label6
  const first = L.firstFit!
  const rest = L.restFit!
  const nome = splitNome(name)
  return (
    <div className="credential-card label label6">
      <div className="label-info">
        {medidor && (
          <>
            <p
              className="label6-event"
              style={{
                fontSize: `${L.event.font * PT_TO_PX}px`,
                width: `${first.areaW}mm`,
                top: `calc(${L.event.y}mm - ${ASCENT_EM}em)`
              }}
            >
              {eventName}
            </p>
            {/* sem sobrenome → primeiro nome desce para ySolo e o bloco do restante não existe */}
            <AutoFitLine
              medidor={medidor}
              text={nome.first}
              fit={first}
              baseline={nome.rest ? first.y : first.ySolo}
              className="label6-first"
            />
            {nome.rest ? (
              <AutoFitLine
                medidor={medidor}
                text={nome.rest}
                fit={rest}
                baseline={rest.y}
                className="label6-rest"
              />
            ) : null}
            {standText ? (
              <AutoFitStand medidor={medidor} text={standText} fit={L.standFit!} />
            ) : null}
          </>
        )}
      </div>
    </div>
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

  if (templateStyle === 'label6') {
    return (
      <Label6Card
        name={participant.name}
        eventName={eventName}
        standText={standDisplay !== '—' ? standDisplay : (grupo !== '—' ? grupo : '')}
      />
    )
  }

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
  // Universo no servidor × o que veio nesta página. O endpoint tem teto de 500 por
  // requisição e a tela não pagina: sem estes dois números ela dizia "Imprimir todos"
  // sobre uma fatia dos mais recentes, calada.
  const [totalNoEvento, setTotalNoEvento] = useState(0)
  const [carregados, setCarregados] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [loadingQR, setLoadingQR] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'approved' | 'no-credential'>('approved')
  // '' = Todos · 'none' = sem stand · caso contrário o id do stand. As contagens vêm do
  // groupBy do servidor (universo inteiro), nunca da amostra carregada.
  const [filterStandId, setFilterStandId] = useState('')
  const [standCounts, setStandCounts] = useState<StandCount[]>([])
  const [semStandCount, setSemStandCount] = useState(0)
  // Progresso da geração do PDF. null = não está gerando.
  const [progresso, setProgresso] = useState<
    { feitas: number; total: number; parte: number; partes: number } | null
  >(null)
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
  // Só Crachá e Paisagem desenham foto — as etiquetas não. Isto entra na query, então
  // trocar de um grupo para o outro recarrega a lista; trocar dentro do grupo, não.
  const precisaFoto = templateStyle === 'badge' || templateStyle === 'landscape'

  const loadParticipants = useCallback(async (event: Event) => {
    setLoading(true)
    setParticipants([])
    setTotalNoEvento(0)
    setCarregados(0)
    setSelectedIds(new Set())
    try {
      const params = new URLSearchParams({
        eventId: event.id,
        limit: '500',
        // Maço de etiquetas em ordem alfabética, ordenado no servidor — ordenar aqui só
        // ordenaria a amostra.
        orderBy: 'name',
        includeStandCounts: 'true'
      })
      if (filterStatus === 'approved') params.set('approvalStatus', 'approved')
      if (filterStandId) params.set('standId', filterStandId)
      // Foto é opt-in no endpoint: só os templates que desenham foto pedem.
      if (precisaFoto) params.set('includePhoto', 'true')

      const res = await fetch(`/api/admin/eventos/${event.slug}/participantes?${params}`)
      const data = await res.json()
      setStandCounts(Array.isArray(data.standCounts) ? data.standCounts : [])
      setSemStandCount(typeof data.semStandCount === 'number' ? data.semStandCount : 0)
      const recebidos: ParticipantCredential[] = data.participants || data || []
      // 'approved' já é filtrado no servidor (via approvalStatus na query). Aqui só
      // resta o caso 'no-credential', que é exclusivamente client-side (o endpoint
      // não filtra por presença de número). 'all' passa direto.
      const list = recebidos.filter((p: ParticipantCredential) => {
        if (filterStatus === 'no-credential') return !p.credentialNumber
        return true
      })
      setParticipants(list)
      setCarregados(recebidos.length)
      setTotalNoEvento(typeof data.total === 'number' ? data.total : recebidos.length)
    } catch {
      setMessage({ type: 'error', text: 'Erro ao carregar participantes' })
    } finally {
      setLoading(false)
    }
  }, [filterStatus, filterStandId, precisaFoto])

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
      // Mesma régua da prévia — o auto-fit tem que medir com o MESMO instrumento nos dois lados.
      const medidor = await carregarMedidor()

      const evName = selectedEvent?.name || ''

      // Layout parametrizado (config única) — 'label' = 8×4 (idêntico ao anterior),
      // 'label6' = 6×4 sem-QR com nome centralizado. Ver LABEL_LAYOUTS.
      const cfg = LABEL_LAYOUTS[templateStyle]
      const centered = cfg.align === 'center'
      // Centro REAL da página. (Só o 8×4 tem faixa, e ele é left-align — não usa centerX.)
      const centerX = cfg.PW / 2
      const PW = cfg.PW
      const PH = cfg.PH

      // Teto de páginas por PDF SÓ no modo "Stand: todos" — ali o maço é a carga inteira e
      // um PDF de 500 páginas é pesado de abrir e de conferir. Com um stand selecionado o
      // maço é pequeno por natureza e sair em arquivo único é o que o operador quer.
      const semFiltroDeStand = !filterStandId
      const porArquivo = semFiltroDeStand ? Math.min(300, printTargets.length) : printTargets.length
      const partes = Math.ceil(printTargets.length / porArquivo)
      const carimbo = Date.now()

      setProgresso({ feitas: 0, total: printTargets.length, parte: 1, partes })

      for (let parte = 0; parte < partes; parte++) {
        const lote = printTargets.slice(parte * porArquivo, (parte + 1) * porArquivo)
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [PW, PH] })

        for (let i = 0; i < lote.length; i++) {
          if (i > 0) doc.addPage([PW, PH], 'landscape')

          // Devolve o fio ao navegador de tempos em tempos: sem isto o laço é síncrono, o
          // React não repinta e a barra de progresso só apareceria no fim (ou seja, nunca).
          if (i > 0 && i % 25 === 0) {
            setProgresso({ feitas: parte * porArquivo + i, total: printTargets.length, parte: parte + 1, partes })
            await new Promise(resolve => setTimeout(resolve, 0))
          }

          const p = lote[i]
          const standName = p.stand?.name || ''

          // ── Faixa lateral (stripe × PH) — só quando o layout tem faixa (8×4).
          // O setFillColor fica DENTRO do if: solto, ele vaza para o próximo preenchimento.
          if (cfg.stripe > 0) {
            doc.setFillColor(0, 0, 0)
            doc.rect(0, 0, cfg.stripe, PH, 'F')
          }

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

          // ── Nome do participante — label6: 2 blocos com baseline fixa; 8×4: fixo ──
          doc.setFont('helvetica', 'bold')
          let hasLine2 = false
          if (cfg.firstFit && cfg.restFit) {
            // label6: PRIMEIRO NOME em destaque + restante menor. Sem restante, o primeiro
            // nome desce para ySolo — senão o bloco fica solto no alto da etiqueta.
            const { first, rest } = splitNome(p.name)
            const ff = fitLinhaUnica(medidor, first, cfg.firstFit)
            doc.setFontSize(ff.size)
            doc.text(ff.line, centerX, rest ? cfg.firstFit.y : cfg.firstFit.ySolo, { align: 'center' })
            if (rest) {
              const rf = fitLinhaUnica(medidor, rest, cfg.restFit)
              doc.setFontSize(rf.size)
              doc.text(rf.line, centerX, cfg.restFit.y, { align: 'center' })
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
            doc.setFont('helvetica', 'bold')
            if (cfg.standFit) {
              // label6: auto-fit ancorado pela ÚLTIMA linha em `bottom`, com teto fixo em
              // `topLimit` — o stand reduz a fonte em vez de invadir o bloco do nome.
              const fit = fitLabel6Stand(medidor, standName, cfg.standFit)
              doc.setFontSize(fit.size)
              const lineH = fit.size * 1.15 * PT_TO_MM
              let y = cfg.standFit.bottom - (fit.lines.length - 1) * lineH
              for (const l of fit.lines) {
                doc.text(l, centerX, y, { align: 'center' })
                y += lineH
              }
            } else {
              // 8×4 — comportamento fixo original (NÃO alterar)
              doc.setFontSize(cfg.stand.font)
              const standLine = doc.splitTextToSize(standName, cfg.stand.wrap)[0]
              const standY = hasLine2 ? cfg.stand.y2 : cfg.stand.y1
              if (centered) {
                doc.text(standLine, centerX, standY, { align: 'center' })
              } else {
                doc.text(standLine, cfg.textX, standY)
              }
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

        const sufixo = partes > 1 ? `-parte${parte + 1}de${partes}` : ''
        const blob = doc.output('blob')
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `credenciais-${carimbo}${sufixo}.pdf`
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 5000)

        setProgresso({
          feitas: parte * porArquivo + lote.length,
          total: printTargets.length,
          parte: parte + 1,
          partes
        })
        // Respiro entre downloads: navegador nenhum gosta de vários `click()` seguidos.
        if (parte < partes - 1) await new Promise(resolve => setTimeout(resolve, 400))
      }

      setMessage({
        type: 'success',
        text: partes > 1
          ? `✅ ${printTargets.length} etiquetas em ${partes} PDFs de até ${porArquivo} (baixados como "-parte1de${partes}"…). Imprima um de cada vez: Ctrl+P → Impressora: Elgin L42PRO FULL → Tamanho do papel: ${PW}×${PH}mm → Escala: Tamanho real → Margens: Nenhuma`
          : `✅ PDF baixado! Ctrl+P → Impressora: Elgin L42PRO FULL → Tamanho do papel: ${PW}×${PH}mm → Escala: Tamanho real → Margens: Nenhuma → Imprimir`
      })
    } catch (err) {
      console.error('Erro ao gerar PDF:', err)
      alert('Erro ao gerar PDF de etiquetas. Verifique o console.')
    } finally {
      setProgresso(null)
    }
  }

  const selectedParticipants = participants.filter(p => selectedIds.has(p.id))
  const printTargets = selectedParticipants.length > 0 ? selectedParticipants : participants
  // O servidor tem mais gente do que coube nesta requisição (teto de 500).
  const listaTruncada = totalNoEvento > carregados

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

        /* Label6 — 60mm × 40mm, sem QR e sem faixa. O card é físico (1:1), então os blocos
           são posicionados nas MESMAS coordenadas em mm do PDF; tamanho de fonte, largura útil
           e âncora vertical vêm inline de LABEL_LAYOUTS.label6. */
        /* Helvetica primeiro: a MEDIÇÃO vem do jsPDF (tabela Helvetica), então o desenho tem
           que usar a mesma família quando ela existir. Arial é métricamente compatível. */
        .credential-card.label6 { width: 60mm; font-family: 'Helvetica', 'Arial', sans-serif; }
        .credential-card.label6 .label-stripe { display: none; }
        .credential-card.label6 .label-info {
          position: relative;
          display: block;
          padding: 0;
          overflow: hidden;
        }
        /* font-weight 700 e SÓ 700: a régua mede helvetica-bold, que no Windows é desenhada
           com a Arial Bold. Pedir 800/900 faz o Chrome subir para a Arial Black (uma face
           real, ~10% mais larga), o texto estourar a caixa e o text-overflow cortar com …
           um nome que o PDF imprime inteiro — a prévia mentia. */
        .credential-card.label6 .label-info > p {
          position: absolute;
          left: 0; right: 0; margin: 0 auto;
          text-align: center;
          line-height: 1;
          color: #000;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        /* "> p.classe" para vencer a especificidade da regra base acima (nowrap/line-height). */
        .credential-card.label6 .label-info > p.label6-event {
          letter-spacing: 0.3px; text-transform: uppercase;
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

          {/* Filtro por stand — mesmo padrão de select da lista de stands. As contagens são
              do groupBy do servidor e já refletem o filtro de status acima. */}
          {selectedEvent && (
            <select
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 max-w-xs"
              value={filterStandId}
              onChange={e => setFilterStandId(e.target.value)}
            >
              <option value="">Stand: todos</option>
              {standCounts.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.count})</option>
              ))}
              {semStandCount > 0 && (
                <option value="none">Sem stand ({semStandCount})</option>
              )}
            </select>
          )}

          {filterStandId && (
            <button
              type="button"
              onClick={() => setFilterStandId('')}
              className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900 underline"
            >
              Limpar filtro
            </button>
          )}

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
                {listaTruncada ? 'Selecionar carregados' : 'Selecionar todos'} ({participants.length})
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
              disabled={loadingQR || progresso !== null}
              className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
            >
              🖨️ {progresso
                ? 'Gerando...'
                : selectedIds.size > 0
                ? `Imprimir selecionados (${selectedIds.size})`
                : `${listaTruncada ? 'Imprimir carregados' : 'Imprimir todos'} (${participants.length})`}
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

        {/* Progresso da geração — 500 páginas de jsPDF não é instantâneo e o operador
            precisa ver que não travou */}
        {progresso && (
          <div className="mx-6 mt-4 p-4 bg-sky-50 border border-sky-200 rounded-lg text-sm no-print">
            <div className="flex justify-between items-baseline mb-2">
              <p className="font-semibold text-sky-900">
                Gerando etiquetas… {progresso.feitas} de {progresso.total}
                {progresso.partes > 1 && ` · PDF ${progresso.parte} de ${progresso.partes}`}
              </p>
              <span className="text-sky-700 text-xs tabular-nums">
                {Math.round((progresso.feitas / Math.max(1, progresso.total)) * 100)}%
              </span>
            </div>
            <div className="h-2 w-full bg-sky-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-500 transition-all duration-150"
                style={{ width: `${(progresso.feitas / Math.max(1, progresso.total)) * 100}%` }}
              />
            </div>
            {progresso.partes > 1 && (
              <p className="text-sky-800 text-xs mt-2">
                Serão baixados {progresso.partes} arquivos, um por vez. Se o navegador pedir
                permissão para vários downloads, autorize.
              </p>
            )}
          </div>
        )}

        {/* Lista truncada pelo teto do endpoint — o operador precisa saber ANTES de imprimir */}
        {!loading && listaTruncada && (
          <div className="mx-6 mt-4 p-4 bg-orange-50 border border-orange-300 rounded-lg text-sm no-print">
            <p className="font-bold text-orange-900 mb-1">
              ⚠️ Nem todos os participantes estão carregados
            </p>
            <p className="text-orange-800">
              Esta tela carregou <strong>{carregados}</strong> de <strong>{totalNoEvento}</strong> participantes
              do evento — os mais recentes. O que estiver fora não aparece na prévia nem entra no PDF.
            </p>
            <p className="text-orange-800 mt-1">
              Para imprimir um conjunto completo, use o <strong>filtro por stand</strong>: cada stand cabe
              inteiro em uma carga.
            </p>
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
              {listaTruncada
                ? `${participants.length} de ${totalNoEvento} participantes (carregados os mais recentes)`
                : `${participants.length} participante(s)`}
              {' · '}
              {selectedIds.size > 0 ? `${selectedIds.size} selecionado(s)` : 'Clique para selecionar'}
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
