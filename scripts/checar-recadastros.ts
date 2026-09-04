/**
 * CHECAGEM DIÁRIA — a correção da raiz está funcionando com gente de verdade?
 *
 * SOMENTE LEITURA. Escreve RELATORIO-recadastros.md na raiz do projeto
 * (arquivo local, fora do Git — contém nome e CPF parcial de pessoas reais).
 *
 * Contexto: em 04/09/2026 subiu a correção que faz uma linha `removed` deixar
 * de bloquear o recadastro (commit d0e133e). Oito pessoas do Expofest estavam
 * travadas nesse 409. Esta checagem responde três coisas:
 *
 *   1. quais delas se recadastraram — com id, horário e stand NOVO
 *   2. quais seguem travadas, e há quantos dias
 *   3. se apareceu linha `removed` NOVA desde 04/09 — ou seja, se os gestores
 *      pararam de usar o remove-e-reativa depois do aviso
 *
 * Se em três dias nenhuma das oito tiver se recadastrado, a leitura NÃO é
 * "a correção falhou": é que o aviso não chegou em quem devia. Metade dos
 * stands do Expofest (54 de 120) tem o mesmo e-mail de responsável, então o
 * aviso por e-mail cai todo numa caixa só. Ver EMAILS-responsaveis-a-preencher.md.
 *
 * Uso: npx tsx scripts/checar-recadastros.ts
 */
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })
import { prisma } from '../lib/prisma'

/** Data do deploy da correção da raiz. */
const CORRECAO = new Date('2026-09-04T23:10:00Z')

/**
 * ⚠️ PREENCHER QUANDO O AVISO AOS RESPONSÁVEIS FOR DISPARADO.
 *
 * Formato: '2026-09-05T12:00:00Z' (UTC). Enquanto estiver `null`, o relatório
 * só REPORTA o estado — não conclui nada sobre o aviso ter chegado ou não.
 *
 * Por que separado de CORRECAO: a regra dos 3 dias mede se o aviso alcançou
 * quem tira a foto, e um aviso não pode falhar antes de existir. Contar desde o
 * deploy acusaria "o aviso não chegou" enquanto ele ainda nem tinha sido
 * escrito — e a conclusão errada mandaria caçar 54 e-mails sem motivo.
 */
const AVISO_ENVIADO_EM: Date | null = null

/** As 8 que estavam travadas quando a correção subiu (id → nome). */
const TRAVADAS_EM_04_09 = [
  'Elizangela Prestes de Almeida',
  'Maria Eduarda Schreiber Jesus',
  'Isabelly vitoria machado',
  'Andressa Klinger Jarutas',
  'Gabrielli de oliveira franco',
  'Fatima cristiane rodrigues de oliveira',
  'Janice da Veiga flores',
  'Carlos henz'
]

const mask = (c: string) => (c.length === 11 ? `${c.slice(0, 3)}.***.***-${c.slice(9)}` : c)
const dt = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—')
const dias = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86400000)

async function main() {
  const agora = new Date()
  const ev = await prisma.event.findUnique({
    where: { slug: 'expofest-2026' },
    select: { id: true, name: true }
  })
  if (!ev) throw new Error('evento não encontrado')

  const L: string[] = []
  L.push(`# Checagem de recadastros — ${ev.name}`)
  L.push('')
  L.push(`Rodado em **${dt(agora)}**. Somente leitura.`)
  L.push('')
  L.push('Arquivo local, fora do Git: contém nome e CPF parcial de pessoas reais.')
  L.push('')

  // ── 1. QUEM SE RECADASTROU (audit é a fonte, não a linha) ────────────────
  const revs = await prisma.auditLog.findMany({
    where: { action: 'PARTICIPANT_RE_REGISTERED', eventId: ev.id, createdAt: { gte: CORRECAO } },
    select: { createdAt: true, entityId: true, previousData: true, newData: true, changes: true },
    orderBy: { createdAt: 'asc' }
  })

  L.push(`## 1. Recadastraram: ${revs.length}`)
  L.push('')
  if (revs.length === 0) {
    L.push('_Nenhum recadastro desde a correção._')
  } else {
    L.push('| Pessoa | id | Quando | Stand antes | Stand agora | Nome divergente |')
    L.push('|---|---|---|---|---|---|')
    for (const r of revs) {
      const p = await prisma.participant.findUnique({
        where: { id: r.entityId ?? '' },
        select: { name: true, cpf: true, approvalStatus: true, faceData: true, stand: { select: { code: true } } }
      })
      const antes: any = r.previousData ?? {}
      const standAntes = antes.standId
        ? (await prisma.stand.findUnique({ where: { id: antes.standId }, select: { code: true } }))?.code ?? '?'
        : '—'
      const div = (r.changes as any)?.nomeDivergente ? '**sim**' : 'não'
      L.push(`| ${p?.name ?? '?'} (${mask(p?.cpf ?? '')}) | \`${r.entityId?.slice(0, 8)}\` | ${dt(r.createdAt)} | ${standAntes} | ${p?.stand?.code ?? '—'} | ${div} |`)
    }
    L.push('')
    L.push('Conferir em cada um: `approvalStatus` deve estar **pending** (precisa de aprovação nova) e a foto deve existir.')
    for (const r of revs) {
      const p = await prisma.participant.findUnique({
        where: { id: r.entityId ?? '' },
        select: { name: true, approvalStatus: true, faceData: true }
      })
      L.push(`- ${p?.name}: aprovação=**${p?.approvalStatus}**, foto=${p?.faceData ? 'sim' : '**FALTA**'}`)
    }
  }
  L.push('')

  // ── 2. QUEM SEGUE TRAVADA ────────────────────────────────────────────────
  const aindaRemovidas = await prisma.participant.findMany({
    where: { eventId: ev.id, status: 'removed', isDeleted: false },
    select: { id: true, name: true, cpf: true, removedAt: true, createdAt: true, stand: { select: { code: true } } },
    orderBy: { removedAt: 'asc' }
  })
  // só bloqueiam se forem a única linha daquele CPF no evento
  const travadas: typeof aindaRemovidas = []
  for (const r of aindaRemovidas) {
    const outras = await prisma.participant.count({ where: { cpf: r.cpf, eventId: ev.id, id: { not: r.id } } })
    if (outras === 0) travadas.push(r)
  }

  L.push(`## 2. Ainda travadas: ${travadas.length}`)
  L.push('')
  if (travadas.length === 0) {
    L.push('_Nenhuma._')
  } else {
    L.push('| Pessoa | Stand | Removida em | Dias travada | Estava na lista de 04/09 |')
    L.push('|---|---|---|---|---|')
    for (const r of travadas) {
      const original = TRAVADAS_EM_04_09.some((n) => r.name.startsWith(n.slice(0, 18)))
      L.push(`| ${r.name} (${mask(r.cpf)}) | ${r.stand?.code ?? '—'} | ${dt(r.removedAt)} | **${r.removedAt ? dias(r.removedAt) : '?'}** | ${original ? 'sim' : 'não (nova)'} |`)
    }
  }
  L.push('')

  // ── 3. REMOVE-E-REATIVA PAROU? ───────────────────────────────────────────
  const novasRemocoes = await prisma.auditLog.findMany({
    where: { action: 'PARTICIPANT_REMOVED', eventId: ev.id, createdAt: { gte: CORRECAO } },
    select: { createdAt: true, actorIdentifier: true, ip: true, standId: true, targetSnapshot: true },
    orderBy: { createdAt: 'asc' }
  })
  const novasReativacoes = await prisma.auditLog.count({
    where: { action: 'PARTICIPANT_REACTIVATED', eventId: ev.id, createdAt: { gte: CORRECAO } }
  })

  L.push(`## 3. Desde a correção: ${novasRemocoes.length} remoção(ões), ${novasReativacoes} reativação(ões)`)
  L.push('')
  L.push('Reativação depois do aviso é o sinal de que a orientação **não chegou** — o caminho')
  L.push('certo passou a ser a pessoa se recadastrar sozinha pelo link do stand.')
  L.push('')
  if (novasRemocoes.length === 0) {
    L.push('_Nenhuma remoção nova._')
  } else {
    L.push('| Quando | Stand | Ator registrado (é o e-mail DO STAND, não de quem clicou) | IP |')
    L.push('|---|---|---|---|')
    for (const r of novasRemocoes) {
      const st = r.standId
        ? (await prisma.stand.findUnique({ where: { id: r.standId }, select: { code: true } }))?.code ?? '?'
        : '—'
      L.push(`| ${dt(r.createdAt)} | ${st} | ${r.actorIdentifier ?? '—'} | ${r.ip ?? '—'} |`)
    }
  }
  L.push('')

  // ── 4. LEITURA ───────────────────────────────────────────────────────────
  const diasDesde = Math.floor((Date.now() - CORRECAO.getTime()) / 86400000)
  L.push('## Leitura')
  L.push('')
  L.push(`Passaram **${diasDesde} dia(s)** desde a correção (deploy em ${dt(CORRECAO)}).`)
  L.push('')

  if (revs.length > 0) {
    L.push(`✅ A correção está funcionando com gente de verdade: ${revs.length} recadastro(s).`)
    L.push('Confirmar que cada um foi **aprovado** depois da foto — sem isso não entram no evento.')
  } else if (AVISO_ENVIADO_EM === null) {
    L.push('ℹ️ **Sem conclusão sobre alcance do aviso**: `AVISO_ENVIADO_EM` ainda está `null`')
    L.push('no script. A regra dos 3 dias mede se o aviso chegou em quem tira a foto, e ela só')
    L.push('começa a valer a partir do envio — um aviso não pode falhar antes de existir.')
    L.push('')
    L.push('Preencha `AVISO_ENVIADO_EM` em `scripts/checar-recadastros.ts` ao disparar o aviso.')
  } else {
    const diasDoAviso = Math.floor((Date.now() - AVISO_ENVIADO_EM.getTime()) / 86400000)
    L.push(`Aviso aos responsáveis enviado em ${dt(AVISO_ENVIADO_EM)} — há **${diasDoAviso} dia(s)**.`)
    L.push('')
    if (diasDoAviso >= 3) {
      L.push('⚠️ **Três dias de aviso e nenhum recadastro.** A correção está provada em teste,')
      L.push('então a hipótese mais provável não é técnica: o aviso não chegou em quem tira a')
      L.push('foto. 54 dos 120 stands têm o mesmo e-mail de responsável — ver')
      L.push('`EMAILS-responsaveis-a-preencher.md`. Considerar WhatsApp: 28 desses 54 já têm')
      L.push('telefone distinto cadastrado.')
    } else {
      L.push('Ainda cedo para concluir. Reavaliar no terceiro dia após o envio.')
    }
  }

  const destino = path.resolve(process.cwd(), 'RELATORIO-recadastros.md')
  fs.writeFileSync(destino, L.join('\n') + '\n', 'utf8')
  console.log(`relatório escrito: ${destino}`)
  console.log(`  recadastraram: ${revs.length}   ainda travadas: ${travadas.length}   remoções novas: ${novasRemocoes.length}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
