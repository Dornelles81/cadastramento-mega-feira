// LEGADO — único ponto que lê credencial de device por variável de ambiente.
//
// Existe só para os endpoints single-device antigos (pages/api/hikvision/* e
// lib/hikvision/service.ts) continuarem funcionando após o client.ts passar a
// exigir credencial por instância. O caminho novo (agente local) NUNCA usa isto:
// lá a credencial vem decriptada da tabela Terminal, injetada pelo endpoint do
// agente na nuvem.
//
// DÍVIDA TÉCNICA: aposentar este módulo e seus chamadores quando o sistema novo
// (ParticipantTerminalSync por terminal) for provado no evento — ver
// device-integration-plan. Não há senha hardcoded aqui: se HIKVISION_PASSWORD
// não estiver setado, a auth simplesmente falha (sem fallback para credencial
// comprometida).

import type { HikvisionClientConfig } from './client';

export function legacyEnvConfig(): HikvisionClientConfig {
  return {
    ipAddress: process.env.HIKVISION_DEVICE_IP || '',
    port: process.env.HIKVISION_DEVICE_PORT ? Number(process.env.HIKVISION_DEVICE_PORT) : 80,
    useHttps: process.env.HIKVISION_USE_HTTPS === 'true',
    username: process.env.HIKVISION_USER || 'admin',
    password: process.env.HIKVISION_PASSWORD || ''
  };
}
