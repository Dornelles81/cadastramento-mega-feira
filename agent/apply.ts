/**
 * Aplicação de um item de trabalho no terminal real, via HikvisionClient (as 5
 * ops provadas na Fase 1). O agente recebe a face já decriptada da nuvem; aqui
 * só fala ISAPI.
 *
 * ORDEM (requisito): addUser SEMPRE antes de face/card. Cada kind é INDEPENDENTE
 * (retry coerente por kind): falha no face não impede o card e vice-versa. Se o
 * addUser falha e o usuário não existe, face e card falham juntos (não há onde
 * escrever). Idempotência por re-push/revive: "já existe" não é erro (confirmado
 * por searchUsers, sem adivinhar subStatusCode).
 */
import { HikvisionClient, HikvisionError, type HikvisionUser } from '../lib/hikvision/client'
import type { PushItem, RemovalItem, Ack } from './api'

export function buildUser(item: PushItem): HikvisionUser {
  return {
    employeeNo: item.employeeNo,
    name: item.name || `User ${item.employeeNo}`,
    userType: 'normal',
    valid: { enable: true, beginTime: item.validBegin, endTime: item.validEnd }
  }
}

function errMsg(e: any): string {
  return String(e instanceof HikvisionError ? e.message : (e?.message ?? e)).slice(0, 500)
}
function subStatus(e: any): string | undefined {
  return (e?.deviceStatus as any)?.subStatusCode
}
async function userExists(client: HikvisionClient, employeeNo: string): Promise<boolean> {
  try {
    const r: any = await client.searchUsers(employeeNo)
    return ((r?.UserInfoSearch?.numOfMatches ?? 0) as number) > 0
  } catch { return false }
}

export async function applyPush(client: HikvisionClient, item: PushItem): Promise<Ack[]> {
  const acks: Ack[] = []

  // 1) addUser (com a janela de validade resolvida na nuvem)
  try {
    await client.addUser(buildUser(item))
  } catch (e) {
    // re-push/revive: pode já existir. Confirma de verdade em vez de adivinhar.
    if (!(await userExists(client, item.employeeNo))) {
      const msg = `addUser falhou: ${errMsg(e)}`
      if (item.needFace) acks.push({ syncId: item.syncId, kind: 'face', status: 'failed', error: msg })
      if (item.needCard) acks.push({ syncId: item.syncId, kind: 'card', status: 'failed', error: msg })
      return acks
    }
  }

  // 2) face (independente). F5: o `faceVersion` do item é ecoado no ack p/ a
  // nuvem registrar a versão sincronizada.
  if (item.needFace) {
    if (!item.face) {
      acks.push({ syncId: item.syncId, kind: 'face', status: 'failed', error: 'face ausente no payload do /work' })
    } else {
      try {
        await client.uploadFace(item.employeeNo, item.face)
        acks.push({ syncId: item.syncId, kind: 'face', status: 'success', faceVersion: item.faceVersion ?? undefined })
      } catch (e) {
        if (subStatus(e) === 'deviceUserAlreadyExistFace') {
          // O device já tem uma face, mas a nuvem enfileirou ESTA (pending) → é
          // uma face DESATUALIZADA (re-captura). O device não sobrescreve, então
          // recria o usuário (deleteUser apaga a face antiga) e re-sobe. O card
          // vem em seguida (a nuvem marcou cardState pending no update de face).
          try {
            await client.deleteUser(item.employeeNo)
            await client.addUser(buildUser(item))
            await client.uploadFace(item.employeeNo, item.face)
            acks.push({ syncId: item.syncId, kind: 'face', status: 'success', faceVersion: item.faceVersion ?? undefined })
          } catch (e2) {
            acks.push({ syncId: item.syncId, kind: 'face', status: 'failed', error: 'replace de face falhou: ' + errMsg(e2) })
          }
        } else {
          acks.push({ syncId: item.syncId, kind: 'face', status: 'failed', error: errMsg(e) })
        }
      }
    }
  }

  // 3) card (independente)
  if (item.needCard) {
    if (!item.cardNumber) {
      acks.push({ syncId: item.syncId, kind: 'card', status: 'failed', error: 'cardNumber ausente no payload' })
    } else {
      try {
        await client.registerCard(item.employeeNo, item.cardNumber)
        acks.push({ syncId: item.syncId, kind: 'card', status: 'success' })
      } catch (e) {
        acks.push({ syncId: item.syncId, kind: 'card', status: 'failed', error: errMsg(e) })
      }
    }
  }

  return acks
}

export async function applyRemoval(client: HikvisionClient, item: RemovalItem): Promise<Ack> {
  try {
    await client.deleteUser(item.employeeNo)
    return { syncId: item.syncId, kind: 'removal', status: 'success' }
  } catch (e) {
    // se o usuário já não existe no device, a remoção está satisfeita
    if (!(await userExists(client, item.employeeNo))) {
      return { syncId: item.syncId, kind: 'removal', status: 'success' }
    }
    return { syncId: item.syncId, kind: 'removal', status: 'failed', error: errMsg(e) }
  }
}
