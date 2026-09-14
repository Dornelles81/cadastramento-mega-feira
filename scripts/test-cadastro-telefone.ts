/**
 * TELEFONE NO CADASTRO — o servidor, ponta a ponta.
 *
 * O teste de unidade (`scripts/test-telefone.ts`) cobre a regra; este cobre o
 * que o participante vive: a recusa chega em PORTUGUÊS, dizendo o que fazer, e
 * o número aceito é gravado normalizado.
 *
 * O caso que motivou tudo: um cadastro do link do stand em produção recebeu
 * «"phone" length must be at least 10 characters long» DEPOIS da foto, em
 * inglês, sem dizer o campo — era celular sem DDD.
 *
 * Cria um evento próprio e apaga tudo no final. Uso:
 *   .\scripts\testar.ps1 scripts\test-cadastro-telefone.ts
 */
import * as dotenv from 'dotenv'
import { assertBancoDeTeste } from './_guard'
dotenv.config({ path: '.env.local' })
assertBancoDeTeste('test-cadastro-telefone.ts')

import { prisma } from '../lib/prisma'
import { registrarCredenciado } from '../lib/participants/registrar'

const SUF = Date.now().toString(36)
let falhas = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) falhas++
}

// CPFs válidos (dígitos verificadores conferem) para não esbarrar noutra regra.
const CPFS = ['00097680095', '11144477735', '52998224725', '15350946056', '01234567890']

async function main() {
  const agora = new Date()
  const ev = await prisma.event.create({
    data: {
      name: 'TELEFONE TEST', slug: 'tel-' + SUF, code: 'TEL-' + SUF,
      startDate: agora, endDate: new Date(agora.getTime() + 86400000),
      eventConfigs: { create: { requireFace: false } }
    }
  })
  const stand = await prisma.stand.create({
    data: {
      eventId: ev.id, code: 'S1', name: 'Stand 1', maxRegistrations: 50,
      responsibleEmail: 'teste@exemplo.invalid', responsibleName: 'Teste'
    }
  })
  const ctx = { eventId: ev.id, standId: stand.id, standMaxRegistrations: 50, ip: '127.0.0.1', userAgent: 'teste' }
  const base = { consent: true, faceImage: null as any, faceData: null as any }

  console.log('\n── 1) O CASO DE PRODUÇÃO: celular sem DDD ──')
  const semDDD = await registrarCredenciado({ ...base, name: 'Sem DDD', cpf: CPFS[0], phone: '999887766' }, ctx)
  const msg = (r: any) => r?.recusa?.body?.message
  check('recusado', !semDDD.ok)
  check('status 400', (semDDD as any).recusa?.status === 400)
  check('mensagem em português, dizendo o que fazer', /DDD/.test(msg(semDDD) || ''), msg(semDDD))
  check('sem resto de Joi em inglês', !/must be at least|characters long/i.test(msg(semDDD) || ''))

  console.log('\n── 2) O QUE A REGRA ANTIGA DEIXAVA PASSAR ──')
  // Os dois têm 10 caracteres: `min(10)` aceitava ambos.
  const celularQuebrado = await registrarCredenciado(
    { ...base, name: 'Celular Quebrado', cpf: CPFS[1], phone: '5599988776' }, ctx)
  check('celular com um dígito faltando agora é RECUSADO', !celularQuebrado.ok, msg(celularQuebrado))

  const fixo = await registrarCredenciado(
    { ...base, name: 'Fixo De Verdade', cpf: CPFS[2], phone: '(55) 3333-4444' }, ctx)
  check('telefone fixo com DDD continua aceito', fixo.ok, fixo.ok ? undefined : msg(fixo))
  const pFixo = fixo.ok ? await prisma.participant.findUnique({ where: { id: fixo.participant.id } }) : null
  check('fixo gravado como 10 dígitos limpos', pFixo?.phone === '5533334444', pFixo?.phone)

  console.log('\n── 3) NORMALIZAÇÃO DO QUE É GRAVADO ──')
  const comPais = await registrarCredenciado(
    { ...base, name: 'Com Codigo Pais', cpf: CPFS[3], phone: '+55 (51) 99988-7766' }, ctx)
  check('aceita número com +55 e máscara', comPais.ok, comPais.ok ? undefined : msg(comPais))
  const pPais = comPais.ok ? await prisma.participant.findUnique({ where: { id: comPais.participant.id } }) : null
  check('grava só os 11 dígitos, sem +55 nem máscara', pPais?.phone === '51999887766', pPais?.phone)

  console.log('\n── 4) VAZIO CONTINUA PASSANDO ──')
  // "Obrigatório" é decisão do FORMULÁRIO, por evento (_system_phone). Há
  // eventos com o campo desligado — e 480 cadastros do Expofest que nasceram
  // assim, antes de 03/09/2026.
  const vazio = await registrarCredenciado({ ...base, name: 'Sem Telefone', cpf: CPFS[4], phone: '' }, ctx)
  check('telefone vazio é aceito pelo servidor', vazio.ok, vazio.ok ? undefined : msg(vazio))

  // limpeza
  await prisma.participant.deleteMany({ where: { eventId: ev.id } })
  await prisma.stand.deleteMany({ where: { eventId: ev.id } })
  await prisma.eventConfig.deleteMany({ where: { eventId: ev.id } })
  await prisma.auditLog.deleteMany({ where: { eventId: ev.id } })
  await prisma.event.delete({ where: { id: ev.id } })
  console.log('\n(evento de teste removido)')
  console.log(falhas === 0 ? '\nTODOS OS CASOS PASSARAM' : `\n${falhas} FALHA(S)`)
  if (falhas > 0) process.exitCode = 1
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
