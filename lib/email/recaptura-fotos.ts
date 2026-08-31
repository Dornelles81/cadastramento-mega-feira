/**
 * E-mail ao gestor do stand com a lista de fotos que precisam ser refeitas.
 *
 * ── Por que este e-mail existe ─────────────────────────────────────────────
 * Quem tem contato com o participante é o GESTOR DO STAND — foi ele quem
 * despachou o link de cadastro. A organização não tem como falar com cada
 * pessoa: no levantamento de 2026-08-31, ZERO dos participantes com foto de
 * risco tinha telefone próprio cadastrado. Já o e-mail do responsável estava
 * preenchido em 10 de 10 stands.
 *
 * Com ~13% de fotos ruins e 8.000 participantes previstos, seriam mais de mil
 * recapturas. Organizar isso por mensagem manual não escala; este e-mail é o
 * que transfere a tarefa para quem consegue executá-la.
 *
 * NÃO leva link de edição: gerar link de edição de terceiros é decisão de
 * permissão em aberto (o gestor passaria a poder ALTERAR foto de outra pessoa,
 * não só ver). Enquanto isso não se decide, o e-mail aponta para o painel do
 * stand, que o gestor já tem, e para a organização.
 *
 * NÃO leva as fotos anexadas nem embutidas: é biometria, e e-mail é canal que
 * atravessa servidores de terceiros e fica na caixa de entrada indefinidamente.
 * A foto é vista no painel, que exige o token.
 */
import { Resend } from 'resend'

export interface PessoaParaRecapturar {
  nome: string
  /** Motivo em linguagem de quem vai pedir a foto, não rótulo técnico. */
  motivo: string
}

export interface RecapturaEmailParams {
  to: string
  responsibleName: string | null
  standName: string
  standCode: string
  eventName: string
  /** Link do painel do stand. null = não enviar botão (o gestor já tem o dele). */
  painelLink: string | null
  pessoas: PessoaParaRecapturar[]
}

const TEAL = '#2DD4BF'
const NAVY = '#1E3A5F'

export async function sendRecapturaEmail(params: RecapturaEmailParams) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('RESEND_API_KEY não configurada')
  }
  if (params.pessoas.length === 0) {
    throw new Error('Nada a enviar: lista de pessoas vazia')
  }

  const resend = new Resend(apiKey)
  const from =
    process.env.RESEND_FROM_EMAIL || 'Mega Credenciamento <onboarding@resend.dev>'

  const n = params.pessoas.length
  const { data, error } = await resend.emails.send({
    from,
    to: params.to,
    subject: `${params.eventName} — ${n} ${n === 1 ? 'foto precisa' : 'fotos precisam'} ser ${n === 1 ? 'refeita' : 'refeitas'} (${params.standName})`,
    html: buildHtml(params),
    text: buildText(params)
  })

  if (error) {
    throw new Error(`Falha no envio do e-mail: ${error.message}`)
  }
  return data
}

function buildText(p: RecapturaEmailParams): string {
  const n = p.pessoas.length
  return [
    `Olá${p.responsibleName ? `, ${p.responsibleName}` : ''}!`,
    '',
    `No stand ${p.standName} (${p.standCode}), ${n === 1 ? 'uma foto' : `${n} fotos`} do credenciamento ` +
      `${n === 1 ? 'precisa' : 'precisam'} ser refeita${n === 1 ? '' : 's'}.`,
    '',
    'O reconhecimento facial na entrada do evento usa essas fotos. Do jeito que estão, ' +
      'a pessoa pode não ser reconhecida e ficar parada na portaria.',
    '',
    'Quem precisa refazer:',
    ...p.pessoas.map((x) => `  - ${x.nome} — ${x.motivo}`),
    '',
    p.painelLink
      ? `Veja as fotos no painel do seu stand: ${p.painelLink}`
      : 'Veja as fotos no painel do seu stand, pelo link que a organização enviou.',
    '',
    'Para refazer: peça à pessoa que faça um novo cadastro pelo link do stand, ou ' +
      'fale com a organização do evento.',
    '',
    'Dicas para uma foto que funciona: rosto de frente, sozinho na imagem, ' +
      'bem iluminado, sem óculos escuros nem boné, e perto o suficiente para o ' +
      'rosto ocupar boa parte da foto.',
    '',
    'Mega Credenciamento'
  ].join('\n')
}

function buildHtml(p: RecapturaEmailParams): string {
  const n = p.pessoas.length
  const linhas = p.pessoas
    .map(
      (x) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;">
          <span style="color:#0f172a;font-size:15px;font-weight:600;">${escapeHtml(x.nome)}</span><br/>
          <span style="color:#64748b;font-size:13px;">${escapeHtml(x.motivo)}</span>
        </td>
      </tr>`
    )
    .join('')

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
                No stand <strong>${escapeHtml(p.standName)}</strong>
                (<code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">${escapeHtml(p.standCode)}</code>),
                ${n === 1 ? '<strong>uma foto</strong> do credenciamento precisa' : `<strong>${n} fotos</strong> do credenciamento precisam`}
                ser refeita${n === 1 ? '' : 's'}.
              </p>
              <div style="background-color:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:24px;">
                <p style="margin:0;color:#78350f;font-size:14px;line-height:1.6;">
                  O reconhecimento facial na entrada usa essas fotos. Do jeito que estão,
                  a pessoa pode <strong>não ser reconhecida</strong> e ficar parada na portaria.
                </p>
              </div>
              <p style="margin:0 0 8px;color:#0f172a;font-size:15px;font-weight:600;">Quem precisa refazer</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                ${linhas}
              </table>
              ${
                p.painelLink
                  ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding:0 0 24px;">
                    <a href="${p.painelLink}"
                       style="display:inline-block;background-color:${TEAL};color:${NAVY};text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;">
                      Ver as fotos no painel
                    </a>
                  </td>
                </tr>
              </table>`
                  : `<p style="margin:0 0 24px;color:#333;font-size:14px;line-height:1.6;">
                  Veja as fotos no painel do seu stand, pelo link que a organização enviou.
                </p>`
              }
              <p style="margin:0 0 8px;color:#0f172a;font-size:15px;font-weight:600;">Como refazer</p>
              <p style="margin:0 0 16px;color:#333;font-size:14px;line-height:1.6;">
                Peça à pessoa que faça um novo cadastro pelo link do stand, ou fale com a
                organização do evento.
              </p>
              <div style="background-color:#f8fafc;border-left:4px solid ${TEAL};padding:12px 16px;border-radius:0 8px 8px 0;">
                <p style="margin:0 0 6px;color:#0f172a;font-size:13px;font-weight:600;">Uma foto que funciona</p>
                <p style="margin:0;color:#475569;font-size:13px;line-height:1.7;">
                  Rosto de frente &middot; sozinho na imagem &middot; bem iluminado &middot;
                  sem óculos escuros nem boné &middot; perto o suficiente para o rosto
                  ocupar boa parte da foto.
                </p>
              </div>
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
