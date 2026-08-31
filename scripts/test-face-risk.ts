/**
 * Risco de face na aprovação + saneamento das métricas do detector.
 *
 * Teste PURO: sem banco, sem rede, sem dev server. As duas peças que decidem
 * o que o operador vê antes de aprovar, e o que é gravado da captura.
 *
 * Uso: node_modules\.bin\tsx scripts\test-face-risk.ts
 */
import { riscoDeFace, tituloRiscoDeFace, ATENCAO_INTEROCULAR_PX } from '../lib/participants/face-risk'
import { extractFaceMetrics } from '../lib/face/metrics'
import { MIN_INTEROCULAR_PX } from '../lib/face/status'

let falhas = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) falhas++
}

console.log(`piso=${MIN_INTEROCULAR_PX}  atencao=<${ATENCAO_INTEROCULAR_PX}`)

console.log('\n=== riscoDeFace ===')
// captureAnyway: o caso que exige confirmacao ao aprovar.
check('captureAnyway -> nao-validada',
  riscoDeFace({ faceUnvalidated: true, faceInterocularPx: null, faceStatus: 'unmeasured' }) === 'nao-validada')
check('detector rodou e nao achou rosto -> nao-validada',
  riscoDeFace({ faceStatus: 'no_face', faceInterocularPx: 0 }) === 'nao-validada')

// Legado NAO e marcado: nao medido nao e o mesmo que invalido - e a semantica
// que deriveFaceStatus/isValidFace ja usam no resto do sistema.
check('legado (null SEM a flag) -> sem marcacao',
  riscoDeFace({ faceInterocularPx: null, faceStatus: 'unmeasured' }) === null)

check('75px (o caso do rosto cortado) -> medida-baixa',
  riscoDeFace({ faceInterocularPx: 75, faceStatus: 'valid' }) === 'medida-baixa')
check('abaixo do piso -> medida-baixa',
  riscoDeFace({ faceInterocularPx: 55, faceStatus: 'too_small' }) === 'medida-baixa')
check('79px ainda e atencao', riscoDeFace({ faceInterocularPx: 79, faceStatus: 'valid' }) === 'medida-baixa')
check('80px ja e limpo', riscoDeFace({ faceInterocularPx: 80, faceStatus: 'valid' }) === null)
check('116px (mediana da base) -> sem marcacao',
  riscoDeFace({ faceInterocularPx: 116, faceStatus: 'valid' }) === null)

// A flag vence a medicao: se a captura nao foi validada, o numero que veio
// junto nao torna a foto confiavel.
check('unvalidated vence medicao alta',
  riscoDeFace({ faceUnvalidated: true, faceInterocularPx: 150, faceStatus: 'valid' }) === 'nao-validada')

console.log('\n=== tituloRiscoDeFace ===')
check('texto de nao-validada menciona validacao',
  /valida/i.test(tituloRiscoDeFace({ faceUnvalidated: true })))
check('texto de no_face diz que NAO encontrou rosto',
  /NÃO encontrou rosto/i.test(tituloRiscoDeFace({ faceStatus: 'no_face', faceInterocularPx: 0 })))
check('texto de medida-baixa traz o numero',
  tituloRiscoDeFace({ faceInterocularPx: 75, faceStatus: 'valid' }).includes('75px'))
check('sem risco -> texto vazio', tituloRiscoDeFace({ faceInterocularPx: 120, faceStatus: 'valid' }) === '')

console.log('\n=== extractFaceMetrics ===')
const completo = extractFaceMetrics({
  faceBbox: { x: 10.4, y: 20.6, w: 100, h: 120 },
  facePose: { yaw: 0.1, pitch: -0.05, roll: 3.2 },
  faceFrameW: 600, faceFrameH: 800
})
check('bbox arredondado', JSON.stringify(completo.faceBbox) === JSON.stringify({ x: 10, y: 21, w: 100, h: 120 }), completo.faceBbox)
check('pose preservada', JSON.stringify(completo.facePose) === JSON.stringify({ yaw: 0.1, pitch: -0.05, roll: 3.2 }))
check('frame lido', completo.faceFrameW === 600 && completo.faceFrameH === 800)

// Entrada NAO confiavel: vem do navegador.
check('faceData ausente -> tudo null',
  JSON.stringify(extractFaceMetrics(undefined)) === JSON.stringify({ faceBbox: null, facePose: null, faceFrameW: null, faceFrameH: null }))
check('bbox pela METADE -> null (meio bbox nao avalia enquadramento)',
  extractFaceMetrics({ faceBbox: { x: 1, y: 2 } }).faceBbox === null)
check('pose com um eixo faltando -> null',
  extractFaceMetrics({ facePose: { yaw: 0.1, roll: 2 } }).facePose === null)
check('bbox com w<=0 -> null', extractFaceMetrics({ faceBbox: { x: 1, y: 2, w: 0, h: 5 } }).faceBbox === null)
check('string no lugar de numero -> null',
  extractFaceMetrics({ faceFrameW: '600' as any }).faceFrameW === null)
check('NaN -> null', extractFaceMetrics({ faceFrameH: NaN }).faceFrameH === null)
check('frame negativo -> null', extractFaceMetrics({ faceFrameW: -10 }).faceFrameW === null)
check('lixo hostil nao quebra', extractFaceMetrics({ faceBbox: 'DROP TABLE', facePose: 42 }).faceBbox === null)

// captureAnyway: frame existe, deteccao nao.
const anyway = extractFaceMetrics({ faceBbox: null, facePose: null, faceFrameW: 600, faceFrameH: 800 })
check('captureAnyway: frame sim, bbox/pose nao',
  anyway.faceBbox === null && anyway.facePose === null && anyway.faceFrameW === 600)

console.log(`\n=== RESULTADO: ${falhas === 0 ? 'TODOS PASSARAM ✓' : falhas + ' FALHA(S) ✗'} ===`)
process.exit(falhas === 0 ? 0 : 1)
