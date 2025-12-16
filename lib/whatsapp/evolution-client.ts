/**
 * Evolution API Client
 * Cliente para envio de mensagens WhatsApp via Evolution API
 * https://doc.evolution-api.com/
 */

interface EvolutionConfig {
  baseUrl: string
  apiKey: string
  instance: string
}

interface SendMessageParams {
  phone: string
  message: string
}

interface SendMessageResponse {
  success: boolean
  messageId?: string
  error?: string
}

export class EvolutionClient {
  private config: EvolutionConfig
  private enabled: boolean

  constructor() {
    this.config = {
      baseUrl: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
      apiKey: process.env.EVOLUTION_API_KEY || '',
      instance: process.env.EVOLUTION_INSTANCE || 'megafeira'
    }
    // WhatsApp esta desabilitado se EVOLUTION_ENABLED=false ou se nao houver API key
    this.enabled = process.env.EVOLUTION_ENABLED !== 'false' && !!this.config.apiKey
  }

  /**
   * Verifica se o WhatsApp esta habilitado
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Formata numero de telefone para formato WhatsApp
   * Remove caracteres especiais e adiciona codigo do pais se necessario
   */
  private formatPhone(phone: string): string {
    // Remove tudo que nao for digito
    let cleaned = phone.replace(/\D/g, '')

    // Se comecar com 0, remove
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.substring(1)
    }

    // Se nao tiver codigo do pais (55), adiciona
    if (!cleaned.startsWith('55') && cleaned.length <= 11) {
      cleaned = '55' + cleaned
    }

    return cleaned
  }

  /**
   * Testa conexao com a Evolution API
   */
  async testConnection(): Promise<{ success: boolean; status?: string; error?: string }> {
    try {
      const response = await fetch(
        `${this.config.baseUrl}/instance/connectionState/${this.config.instance}`,
        {
          method: 'GET',
          headers: {
            'apikey': this.config.apiKey,
            'Content-Type': 'application/json'
          }
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        return { success: false, error: `HTTP ${response.status}: ${errorText}` }
      }

      const data = await response.json()
      return {
        success: data.instance?.state === 'open',
        status: data.instance?.state || 'unknown'
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Envia mensagem de texto simples
   */
  async sendTextMessage(params: SendMessageParams): Promise<SendMessageResponse> {
    // Se WhatsApp estiver desabilitado, retorna sucesso silencioso
    if (!this.enabled) {
      console.log('[WhatsApp] Integracao desabilitada - mensagem nao enviada')
      return { success: true, messageId: 'disabled' }
    }

    try {
      const formattedPhone = this.formatPhone(params.phone)

      const response = await fetch(
        `${this.config.baseUrl}/message/sendText/${this.config.instance}`,
        {
          method: 'POST',
          headers: {
            'apikey': this.config.apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            number: formattedPhone,
            text: params.message
          })
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Evolution API error:', errorText)
        return { success: false, error: `HTTP ${response.status}: ${errorText}` }
      }

      const data = await response.json()

      return {
        success: true,
        messageId: data.key?.id || data.messageId
      }
    } catch (error: any) {
      console.error('Error sending WhatsApp message:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Envia mensagem com imagem
   */
  async sendImageMessage(params: {
    phone: string
    imageUrl: string
    caption?: string
  }): Promise<SendMessageResponse> {
    // Se WhatsApp estiver desabilitado, retorna sucesso silencioso
    if (!this.enabled) {
      console.log('[WhatsApp] Integracao desabilitada - imagem nao enviada')
      return { success: true, messageId: 'disabled' }
    }

    try {
      const formattedPhone = this.formatPhone(params.phone)

      const response = await fetch(
        `${this.config.baseUrl}/message/sendMedia/${this.config.instance}`,
        {
          method: 'POST',
          headers: {
            'apikey': this.config.apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            number: formattedPhone,
            mediatype: 'image',
            media: params.imageUrl,
            caption: params.caption || ''
          })
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        return { success: false, error: `HTTP ${response.status}: ${errorText}` }
      }

      const data = await response.json()

      return {
        success: true,
        messageId: data.key?.id || data.messageId
      }
    } catch (error: any) {
      console.error('Error sending WhatsApp image:', error)
      return { success: false, error: error.message }
    }
  }
}

/**
 * Formata mensagem de aprovacao com variaveis do participante
 */
export function formatApprovalMessage(
  template: string,
  participant: {
    name: string
    cpf?: string
    email?: string
    phone?: string
    eventName?: string
    eventDate?: string
  }
): string {
  return template
    .replace(/\{nome\}/gi, participant.name || '')
    .replace(/\{name\}/gi, participant.name || '')
    .replace(/\{cpf\}/gi, participant.cpf || '')
    .replace(/\{email\}/gi, participant.email || '')
    .replace(/\{telefone\}/gi, participant.phone || '')
    .replace(/\{phone\}/gi, participant.phone || '')
    .replace(/\{evento\}/gi, participant.eventName || '')
    .replace(/\{event\}/gi, participant.eventName || '')
    .replace(/\{data\}/gi, participant.eventDate || '')
    .replace(/\{date\}/gi, participant.eventDate || '')
}

/**
 * Mensagem padrao de aprovacao
 */
export const DEFAULT_APPROVAL_MESSAGE = `Ola {nome}!

Seu cadastro para o evento {evento} foi *APROVADO* com sucesso!

Voce ja pode acessar o evento utilizando o reconhecimento facial.

Lembre-se de levar um documento com foto para eventual verificacao.

Nos vemos la!

_Equipe Mega Feira_`

export default EvolutionClient
