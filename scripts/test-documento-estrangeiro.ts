/**
 * Cadastro com DOCUMENTO ESTRANGEIRO (sem CPF) — integração ponta a ponta.
 *
 * Cobre o que a marcação "sou estrangeiro" sozinha não resolveria: a UNICIDADE
 * (dois estrangeiros não podem usar o mesmo documento, e a mesma pessoa não
 * entra duas vezes) e a BUSCA DA PORTARIA (o operador precisa achar a pessoa no
 * dia digitando o número solto, sem conhecer o prefixo).
 *
 * O caso mais importante é o 6: número igual em dois países. A busca NÃO pode
 * escolher — tem que pedir o país. Escolher a primeira linha seria liberar a
 * pessoa errada no portão, com nome e foto de outra.
 *
 * Cria um evento próprio e apaga tudo no final. Uso:
 *   .\scripts\testar.ps1 scripts\test-documento-estrangeiro.ts
 */
import * as dotenv from 'dotenv'
import { assertBancoDeTeste } from './_guard'
dotenv.config({ path: '.env.local' })
assertBancoDeTeste('test-documento-estrangeiro.ts')

import { prisma } from '../lib/prisma'
import { registrarCredenciado } from '../lib/participants/registrar'
import {
  resolverDocumentoEstrangeiro,
  interpretarIdentidade,
  identidadeParaQR
} from '../lib/participants/documento'
import { generateCompactQRData } from '../lib/qrcode/generator'

const SUF = Date.now().toString(36)
const FOTO = 'data:image/jpeg;base64,/9j/4AAQ-FAKE-' + SUF
let falhas = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) falhas++
}

async function main() {
  const agora = new Date()
  const ev = await prisma.event.create({
    data: {
      name: 'ESTRANGEIRO TEST', slug: 'estr-' + SUF, code: 'ESTR-' + SUF,
      startDate: agora, endDate: new Date(agora.getTime() + 86400000),
      requiresApprovalForAccess: true,
      eventConfigs: { create: { requireFace: false, allowForeignDocument: false } }
    }
  })
  const stand = await prisma.stand.create({
    data: {
      eventId: ev.id, code: 'S1', name: 'Stand 1', maxRegistrations: 50,
      responsibleEmail: 'teste@exemplo.invalid', responsibleName: 'Teste'
    }
  })
  const ctx = { eventId: ev.id, standId: stand.id, standMaxRegistrations: 50, ip: '127.0.0.1', userAgent: 'teste' }
  const base = { consent: true, faceImage: FOTO, faceData: null as any }
  const recusa = (r: any) => r?.recusa?.body?.error

  console.log('\n── 1) BRASILEIRO: caminho inalterado ──')
  const r1 = await registrarCredenciado({ ...base, name: 'Brasileiro Um', cpf: '000.976.800-95' }, ctx)
  check('CPF com máscara aceito', r1.ok)
  const p1 = r1.ok ? await prisma.participant.findUnique({ where: { id: r1.participant.id } }) : null
  check('gravado como 11 dígitos limpos', p1?.cpf === '00097680095', p1?.cpf)
  check('documentType/Country NULL para brasileiro', p1?.documentType === null && p1?.documentCountry === null)
  const r1b = await registrarCredenciado({ ...base, name: 'CPF Ruim', cpf: '11111111111' }, ctx)
  check('CPF inválido recusado como antes', !r1b.ok && recusa(r1b) === 'Invalid CPF')

  console.log('\n── 2) TRAVA POR EVENTO (interruptor desligado) ──')
  const r2 = await registrarCredenciado(
    { ...base, name: 'Estrangeiro Bloqueado', cpf: 'AB1234567', documentType: 'PP', documentCountry: 'AR' }, ctx)
  check('evento sem a flag recusa documento estrangeiro', !r2.ok && recusa(r2) === 'Foreign document not allowed')

  await prisma.eventConfig.update({ where: { eventId: ev.id }, data: { allowForeignDocument: true } })

  console.log('\n── 3) ESTRANGEIRO com a flag ligada ──')
  const r3 = await registrarCredenciado(
    { ...base, name: 'Passaporte AR', cpf: 'ab 123.4567', documentType: 'pp', documentCountry: 'ar' }, ctx)
  check('aceito', r3.ok)
  const p3 = r3.ok ? await prisma.participant.findUnique({ where: { id: r3.participant.id } }) : null
  check('normalizado: maiúsculas, sem espaço/ponto', p3?.cpf === 'PP-AR:AB1234567', p3?.cpf)
  check('tipo e país nas colunas próprias', p3?.documentType === 'PP' && p3?.documentCountry === 'AR')

  console.log('\n── 4) UNICIDADE ──')
  const r4 = await registrarCredenciado(
    { ...base, name: 'Mesmo Doc Outro Nome', cpf: 'AB1234567', documentType: 'PP', documentCountry: 'AR' }, ctx)
  check('mesmo documento no mesmo evento é RECUSADO', !r4.ok, (r4 as any).recusa?.status)
  const r4b = await registrarCredenciado(
    { ...base, name: 'Mesmo Numero Outro Pais', cpf: 'AB1234567', documentType: 'PP', documentCountry: 'PY' }, ctx)
  check('mesmo número em OUTRO país é aceito', r4b.ok)

  console.log('\n── 5) VALIDAÇÕES DO DOCUMENTO ──')
  const semPais = await registrarCredenciado(
    { ...base, name: 'Sem Pais', cpf: 'XY999', documentType: 'PP', documentCountry: '' }, ctx)
  check('país é obrigatório (é metade da chave)', !semPais.ok && recusa(semPais) === 'Invalid document country')
  const tipoRuim = await registrarCredenciado(
    { ...base, name: 'Tipo Ruim', cpf: 'XY999', documentType: 'RG', documentCountry: 'AR' }, ctx)
  check('tipo fora da lista recusado', !tipoRuim.ok && recusa(tipoRuim) === 'Invalid document type')
  const curto = await registrarCredenciado(
    { ...base, name: 'Curto', cpf: 'A1', documentType: 'PP', documentCountry: 'AR' }, ctx)
  check('número curto demais recusado', !curto.ok && recusa(curto) === 'Invalid document number')

  console.log('\n── 6) BUSCA DA PORTARIA (o caso que evita liberar a pessoa errada) ──')
  const amb = await resolverDocumentoEstrangeiro(prisma as any, ev.id, 'ab-123 4567')
  check('número em 2 países -> AMBÍGUO, não escolhe', amb.tipo === 'ambiguo')
  if (amb.tipo === 'ambiguo') {
    check('duas opções devolvidas', amb.opcoes.length === 2)
    console.log('     mensagem ao operador: ' + JSON.stringify(amb.mensagem))
    check('a mensagem entrega as strings exatas para digitar',
      amb.mensagem.includes('PP-AR:AB1234567') && amb.mensagem.includes('PP-PY:AB1234567'))
    check('a mensagem NÃO expõe nome de ninguém', !amb.mensagem.includes('Passaporte AR'))
  }
  const uy = await registrarCredenciado(
    { ...base, name: 'DNI Uruguaio', cpf: '55667788', documentType: 'DNI', documentCountry: 'UY' }, ctx)
  check('terceiro cadastro (DNI UY) criado', uy.ok)
  const r6 = await resolverDocumentoEstrangeiro(prisma as any, ev.id, '55.667.788')
  check('número solto com 1 dono resolve direto', r6.tipo === 'unico' && (r6 as any).identidade === 'DNI-UY:55667788')
  const r6b = await resolverDocumentoEstrangeiro(prisma as any, ev.id, 'ZZZZ9999')
  check('documento inexistente -> nada', r6b.tipo === 'nada')
  const r6c = await resolverDocumentoEstrangeiro(prisma as any, ev.id, '00097680095')
  check('CPF NÃO é alcançado pela busca de documento', r6c.tipo === 'nada')

  console.log('\n── 7) QR ──')
  const qrBr = generateCompactQRData({ id: p1!.id, name: p1!.name, cpf: p1!.cpf, eventCode: ev.code, standCode: 'S1' })
  check('QR do brasileiro inalterado', qrBr.split('|')[2] === '00097680095', qrBr.split('|')[2])
  const qrEs = generateCompactQRData({ id: p3!.id, name: p3!.name, cpf: p3!.cpf, eventCode: ev.code, standCode: 'S1' })
  check('QR do estrangeiro leva a identidade inteira', qrEs.split('|')[2] === 'PP-AR:AB1234567', qrEs.split('|')[2])
  check('formato posicional intacto (6 partes)', qrEs.split('|').length === 6)
  check('identidadeParaQR: CPF sai igual', identidadeParaQR('00097680095') === '00097680095')

  console.log('\n── 8) INTERPRETAÇÃO ──')
  const i = interpretarIdentidade('DNI-UY:55667788')
  check('lê tipo, país e número', i.estrangeiro && i.tipo === 'DNI' && i.pais === 'UY' && i.numero === '55667788')
  const j = interpretarIdentidade('00097680095')
  check('CPF continua sendo lido como CPF', !j.estrangeiro && j.tipo === 'CPF' && j.pais === 'BR')

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
