import QRCode from 'qrcode'

export interface ParticipantQRData {
  id: string
  name: string
  cpf: string
  eventCode: string
  eventName?: string
  standCode?: string
  standName?: string
  timestamp: string
  version: string
}

/**
 * Generate QR Code data payload for a participant
 */
export function generateQRPayload(participant: {
  id: string
  name: string
  cpf: string
  eventCode?: string
  eventName?: string
  standCode?: string
  standName?: string
}): ParticipantQRData {
  return {
    id: participant.id,
    name: participant.name,
    cpf: participant.cpf,
    eventCode: participant.eventCode || '',
    eventName: participant.eventName || '',
    standCode: participant.standCode || '',
    standName: participant.standName || '',
    timestamp: new Date().toISOString(),
    version: '1.0'
  }
}

/**
 * Generate QR Code as Data URL (base64 PNG)
 */
export async function generateQRCodeDataURL(
  data: ParticipantQRData | string,
  options?: {
    width?: number
    margin?: number
    darkColor?: string
    lightColor?: string
  }
): Promise<string> {
  const payload = typeof data === 'string' ? data : JSON.stringify(data)

  return QRCode.toDataURL(payload, {
    width: options?.width || 150,
    margin: options?.margin || 1,
    color: {
      dark: options?.darkColor || '#000000',
      light: options?.lightColor || '#FFFFFF'
    },
    errorCorrectionLevel: 'M'
  })
}

/**
 * Generate QR Code as SVG string
 */
export async function generateQRCodeSVG(
  data: ParticipantQRData | string,
  options?: {
    width?: number
    margin?: number
    darkColor?: string
    lightColor?: string
  }
): Promise<string> {
  const payload = typeof data === 'string' ? data : JSON.stringify(data)

  return QRCode.toString(payload, {
    type: 'svg',
    width: options?.width || 150,
    margin: options?.margin || 1,
    color: {
      dark: options?.darkColor || '#000000',
      light: options?.lightColor || '#FFFFFF'
    },
    errorCorrectionLevel: 'M'
  })
}

/**
 * Generate QR Code as Buffer (for API responses)
 */
export async function generateQRCodeBuffer(
  data: ParticipantQRData | string,
  options?: {
    width?: number
    margin?: number
    type?: 'png' | 'svg'
  }
): Promise<Buffer> {
  const payload = typeof data === 'string' ? data : JSON.stringify(data)

  if (options?.type === 'svg') {
    const svg = await QRCode.toString(payload, {
      type: 'svg',
      width: options?.width || 300,
      margin: options?.margin || 2,
      errorCorrectionLevel: 'M'
    })
    return Buffer.from(svg, 'utf-8')
  }

  return QRCode.toBuffer(payload, {
    width: options?.width || 300,
    margin: options?.margin || 2,
    errorCorrectionLevel: 'M'
  })
}

/**
 * Generate a simple verification URL for the QR Code
 * This URL can be used to verify participant data online
 */
export function generateVerificationURL(
  participantId: string,
  baseUrl?: string
): string {
  const base = baseUrl || process.env.NEXT_PUBLIC_BASE_URL || 'https://cadastramento-mega-feira.vercel.app'
  return `${base}/verificar/${participantId}`
}

/**
 * Generate compact QR data (smaller payload for better scanning)
 */
export function generateCompactQRData(participant: {
  id: string
  name: string
  cpf: string
  eventCode?: string
  standCode?: string
}): string {
  // Format: MF|ID|CPF|EVENT|STAND|NAME
  // MF = Mega Feira identifier
  const parts = [
    'MF',
    participant.id.substring(0, 8), // Short ID
    participant.cpf.replace(/\D/g, ''), // CPF numbers only
    participant.eventCode || '-',
    participant.standCode || '-',
    participant.name.substring(0, 30) // Truncate name
  ]
  return parts.join('|')
}

/**
 * Parse compact QR data back to object
 */
export function parseCompactQRData(data: string): {
  id: string
  cpf: string
  eventCode: string
  standCode: string
  name: string
} | null {
  if (!data.startsWith('MF|')) return null

  const parts = data.split('|')
  if (parts.length < 6) return null

  return {
    id: parts[1],
    cpf: parts[2],
    eventCode: parts[3] === '-' ? '' : parts[3],
    standCode: parts[4] === '-' ? '' : parts[4],
    name: parts[5]
  }
}
