/**
 * E-mail transacional com o link mágico do stand (Resend).
 *
 * Enquanto o domínio megacredenciamento.com.br não estiver verificado no
 * Resend, usar o remetente sandbox (onboarding@resend.dev) em dev — basta
 * não definir RESEND_FROM_EMAIL.
 */
import { Resend } from 'resend'

export interface StandAccessEmailParams {
  to: string
  responsibleName: string | null
  standName: string
  standCode: string
  eventName: string
  link: string
  expiresAt: Date | null
}

const TEAL = '#2DD4BF'
const NAVY = '#1E3A5F'

export async function sendStandAccessEmail(params: StandAccessEmailParams) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('RESEND_API_KEY não configurada')
  }

  const resend = new Resend(apiKey)
  const from =
    process.env.RESEND_FROM_EMAIL || 'Mega Credenciamento <onboarding@resend.dev>'

  const { data, error } = await resend.emails.send({
    from,
    to: params.to,
    subject: `Credenciamento ${params.eventName} — acesso do stand ${params.standName}`,
    html: buildHtml(params),
    text: buildText(params)
  })

  if (error) {
    throw new Error(`Falha no envio do e-mail: ${error.message}`)
  }
  return data
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeZone: 'America/Sao_Paulo'
  }).format(d)
}

function buildText(p: StandAccessEmailParams): string {
  return [
    `Olá${p.responsibleName ? `, ${p.responsibleName}` : ''}!`,
    '',
    `Você é o responsável pelo stand ${p.standName} (${p.standCode}) no evento ${p.eventName}.`,
    '',
    'Use o link abaixo para acessar o painel do seu stand, cadastrar sua equipe e acompanhar a ocupação das vagas:',
    '',
    p.link,
    '',
    'Você pode compartilhar este link com sua equipe para que façam o próprio cadastro. Atenção: o link também dá acesso ao painel do stand (lista de credenciados e exclusões), então compartilhe apenas com pessoas de confiança.',
    p.expiresAt ? `\nO link é válido até ${formatDate(p.expiresAt)}.` : '',
    '',
    'Em caso de dúvidas, fale com a organização do evento.',
    '',
    'Mega Credenciamento'
  ].join('\n')
}

function buildHtml(p: StandAccessEmailParams): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:'Poppins',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
          <tr>
            <td style="background-color:${NAVY};padding:28px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Mega Credenciamento</h1>
              <p style="margin:4px 0 0;color:${TEAL};font-size:14px;font-weight:600;">${escapeHtml(p.eventName)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;color:#333;font-size:15px;">
                Olá${p.responsibleName ? `, <strong>${escapeHtml(p.responsibleName)}</strong>` : ''}!
              </p>
              <p style="margin:0 0 16px;color:#333;font-size:15px;line-height:1.6;">
                Você é o responsável pelo stand <strong>${escapeHtml(p.standName)}</strong>
                (<code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">${escapeHtml(p.standCode)}</code>)
                no evento <strong>${escapeHtml(p.eventName)}</strong>.
              </p>
              <p style="margin:0 0 24px;color:#333;font-size:15px;line-height:1.6;">
                Pelo botão abaixo você acessa o painel do seu stand: cadastra sua equipe,
                acompanha a ocupação das vagas e gerencia os credenciados.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding:0 0 24px;">
                    <a href="${p.link}"
                       style="display:inline-block;background-color:${TEAL};color:${NAVY};text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;">
                      Acessar painel do stand
                    </a>
                  </td>
                </tr>
              </table>
              <div style="background-color:#f8fafc;border-left:4px solid ${TEAL};padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:24px;">
                <p style="margin:0;color:#475569;font-size:13px;line-height:1.6;">
                  Você pode <strong>compartilhar este link com sua equipe</strong> para que cada um
                  faça o próprio cadastro. Atenção: o link também dá acesso ao painel do stand
                  (lista de credenciados e exclusões) — compartilhe apenas com pessoas de confiança.
                </p>
              </div>
              ${p.expiresAt ? `<p style="margin:0 0 8px;color:#64748b;font-size:13px;">O link é válido até <strong>${formatDate(p.expiresAt)}</strong>.</p>` : ''}
              <p style="margin:0;color:#64748b;font-size:13px;">
                Se o botão não funcionar, copie e cole este endereço no navegador:<br/>
                <a href="${p.link}" style="color:${NAVY};word-break:break-all;">${p.link}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">
                E-mail enviado pela organização do evento. Em caso de dúvidas, fale com a organização.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
