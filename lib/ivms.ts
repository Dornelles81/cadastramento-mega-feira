/**
 * Remoção de usuário no iVMS-4200 AC / terminal Hikvision via ISAPI.
 *
 * Decisão do ADENDO (seção 4): remover o usuário do dispositivo
 * (/ISAPI/AccessControl/UserInfo/Delete) já elimina as faces vinculadas e
 * revoga o acesso físico — não é necessário delete isolado no FDLib.
 *
 * O dispositivo normalmente só é alcançável da rede local (IVMS_HOST default
 * 127.0.0.1), então em produção serverless esta chamada falha e o chamador
 * deve manter a fila `pendingDeviceRemoval` para o sync local reprocessar.
 */
import axios from 'axios'

const IVMS_HOST = process.env.IVMS_HOST ?? 'http://127.0.0.1:7660'
const IVMS_USER = process.env.IVMS_USER ?? 'admin'
const IVMS_PASSWORD = process.env.IVMS_PASSWORD ?? ''

/**
 * Tenta remover o usuário (employeeNo = CPF) do dispositivo.
 * Retorna true em caso de sucesso (ou usuário inexistente, que equivale ao
 * estado desejado); false em qualquer falha — nunca lança.
 */
export async function removeUserFromDevice(cpf: string): Promise<boolean> {
  if (!IVMS_PASSWORD) return false

  try {
    await axios.put(
      `${IVMS_HOST}/ISAPI/AccessControl/UserInfo/Delete?format=json`,
      { UserInfoDelCond: { EmployeeNoList: { employeeNo: [cpf] } } },
      {
        auth: { username: IVMS_USER, password: IVMS_PASSWORD },
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      }
    )
    return true
  } catch (error: any) {
    // Usuário não existe no dispositivo = já está no estado desejado
    const msg = JSON.stringify(error?.response?.data ?? '').toLowerCase()
    if (error?.response?.status === 404 || msg.includes('notexist') || msg.includes('not exist')) {
      return true
    }
    return false
  }
}
