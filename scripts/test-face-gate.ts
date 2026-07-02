/**
 * Testes do combinador do gate de captura (FASE C0 — puro, sem DB, sem browser).
 * Cobre: distância-only inalterada, prioridade, cada bloqueio, histerese e
 * degradação segura (sem keypoints/bbox → não trava).
 *
 * Rodar: npx tsx scripts/test-face-gate.ts
 */
import { decideCapture, DEFAULT_FRAMING_THRESHOLDS, type CaptureInput } from '../lib/face/gate'
import { YAW_MAX_RATIO, ROLL_MAX_DEG } from '../lib/face/status'
import type { Pose } from '../lib/face/pose'

let failures = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}

// Frame de referência 800×800 (régua de submissão ≤800px).
const W = 800, H = 800
const pose = (yaw: number, roll: number, pitch = 0): Pose => ({ yaw, pitch, roll })

// bbox helper a partir do CENTRO (fração) e tamanho (px).
function bboxAt(cxFrac: number, cyFrac: number, w = 200, h = 240) {
  return { x: Math.round(cxFrac * W - w / 2), y: Math.round(cyFrac * H - h / 2), w, h }
}
const CENTERED = bboxAt(0.5, 0.45)           // centro no alvo, longe das bordas
const base = (over: Partial<CaptureInput> = {}): CaptureInput => ({
  distanceReason: 'ok', bbox: CENTERED, frameW: W, frameH: H, pose: pose(0, 0), ...over
})

// Limiares (fonte única) só para nomear os casos — não recalcula nada.
const H_R = (DEFAULT_FRAMING_THRESHOLDS.hyst)
console.log(`(limiares: YAW_MAX=${YAW_MAX_RATIO} ROLL_MAX=${ROLL_MAX_DEG}° framing.tolX=${DEFAULT_FRAMING_THRESHOLDS.tolX} hyst=${H_R})`)

console.log('\n=== 1) DISTÂNCIA manda (regra de ouro) — pose/bbox NÃO reavaliados ===')
check("noFace vence tudo", decideCapture(base({ distanceReason: 'noFace', pose: pose(0.9, 40), bbox: bboxAt(0.9, 0.9, 300, 300) })) === 'noFace')
check("tooSmall vence pose/enquadramento ruins", decideCapture(base({ distanceReason: 'tooSmall', pose: pose(0.9, 40) })) === 'tooSmall')
check("distância ok + tudo bom = ok", decideCapture(base()) === 'ok')

console.log('\n=== 2) PRIORIDADE (um blocker por vez): cutOff → offCenter → tilt → turn ===')
// bbox cortado (x quase 0) + off-center + tilt + turn → cutOff
check("cutOff vence offCenter+tilt+turn", decideCapture(base({ bbox: { x: 2, y: 240, w: 200, h: 240 }, pose: pose(0.9, 40) })) === 'cutOff')
// off-center (dentro do frame) + tilt + turn → offCenter
check("offCenter vence tilt+turn", decideCapture(base({ bbox: bboxAt(0.75, 0.45, 120, 140), pose: pose(0.9, 40) })) === 'offCenter')
// centrado + tilt + turn → tilt (tilt antes de turn)
check("tilt vence turn", decideCapture(base({ pose: pose(0.9, 40) })) === 'tilt')
// centrado + só turn → turnRight (yaw>0)
check("turnRight isolado (yaw>0)", decideCapture(base({ pose: pose(0.9, 0) })) === 'turnRight')
check("turnLeft isolado (yaw<0)", decideCapture(base({ pose: pose(-0.9, 0) })) === 'turnLeft')

console.log('\n=== 3) CADA BLOQUEIO isolado ===')
check("cutOff (borda superior)", decideCapture(base({ bbox: { x: 300, y: 2, w: 200, h: 240 } })) === 'cutOff')
check("offCenter (horizontal)", decideCapture(base({ bbox: bboxAt(0.78, 0.45, 120, 140) })) === 'offCenter')
check("offCenter (vertical)", decideCapture(base({ bbox: bboxAt(0.5, 0.80, 120, 140) })) === 'offCenter')
check("tilt (roll alto)", decideCapture(base({ pose: pose(0, 30) })) === 'tilt')
check("turn (yaw alto)", decideCapture(base({ pose: pose(0.7, 0) })) === 'turnRight')

console.log('\n=== 4) HISTERESE (não tremular na fronteira) ===')
// YAW: enter exige > 0.45+0.05=0.50; exit só sai de turn com < 0.45-0.05=0.40
const yawBorder = 0.47 // entre exit(0.40) e enter(0.50)
check("yaw 0.47 vindo de 'ok' → NÃO bloqueia (ok)", decideCapture(base({ pose: pose(yawBorder, 0) }), 'ok') === 'ok')
check("yaw 0.47 vindo de 'turnRight' → MANTÉM turnRight", decideCapture(base({ pose: pose(yawBorder, 0) }), 'turnRight') === 'turnRight')
// ROLL: enter >15+3=18; exit sai de tilt com <15-3=12
const rollBorder = 16 // entre 12 e 18
check("roll 16 vindo de 'ok' → NÃO bloqueia (ok)", decideCapture(base({ pose: pose(0, rollBorder) }), 'ok') === 'ok')
check("roll 16 vindo de 'tilt' → MANTÉM tilt", decideCapture(base({ pose: pose(0, rollBorder) }), 'tilt') === 'tilt')
// ENQUADRAMENTO: tolX enter=0.20, exit=0.16 (hyst 0.02); usa desvio 0.19 (entre os dois)
const offBorder = bboxAt(0.5 + 0.19, 0.45, 120, 140)
check("desvio 0.19 vindo de 'ok' → NÃO bloqueia (ok)", decideCapture(base({ bbox: offBorder }), 'ok') === 'ok')
check("desvio 0.19 vindo de 'offCenter' → MANTÉM offCenter", decideCapture(base({ bbox: offBorder }), 'offCenter') === 'offCenter')

console.log('\n=== 5) DEGRADAÇÃO SEGURA (sem keypoints/bbox → não trava) ===')
check("sem pose e sem bbox → ok (só distância)", decideCapture({ distanceReason: 'ok' }) === 'ok')
check("sem pose, bbox centrado → ok", decideCapture({ distanceReason: 'ok', bbox: CENTERED, frameW: W, frameH: H }) === 'ok')
check("sem pose, bbox off-center → ainda pega offCenter", decideCapture({ distanceReason: 'ok', bbox: bboxAt(0.78, 0.45, 120, 140), frameW: W, frameH: H }) === 'offCenter')
check("sem bbox, pose ruim → ainda pega turn", decideCapture({ distanceReason: 'ok', pose: pose(0.7, 0) }) === 'turnRight')
check("bbox sem frameW/H → pula enquadramento (ok)", decideCapture({ distanceReason: 'ok', bbox: bboxAt(0.9, 0.9) }) === 'ok')

console.log('\n=== 6) PITCH está FORA do gate (não bloqueia) ===')
check("pitch enorme, resto ok → ok", decideCapture(base({ pose: pose(0, 0, 5) })) === 'ok')
check("pitch enorme + yaw alto → turn (pitch ignorado, yaw pega)", decideCapture(base({ pose: pose(0.7, 0, 5) })) === 'turnRight')

console.log(`\n=== RESULTADO: ${failures === 0 ? 'TODOS PASSARAM ✓' : failures + ' FALHA(S) ✗'} ===`)
process.exit(failures === 0 ? 0 : 1)
