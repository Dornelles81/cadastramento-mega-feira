import { Prisma } from '@prisma/client'

/**
 * Conjunto único de campos sensíveis a limpar quando um participante é
 * removido ou expurgado (LGPD): biometria facial, documentos e metadados de
 * captura. Usado pela exclusão via stand (Fase 5) e pelo cron de expurgo
 * (lgpd-purge) para garantir que ambos apaguem exatamente o mesmo conjunto.
 *
 * documents usa DbNull (não `{}`): o critério do expurgo seleciona
 * `documents != null`, e um objeto vazio re-selecionaria o registro todo dia.
 *
 * customData entra no expurgo (decisão de 2026-06-12): a trilha de auditoria
 * que se mantém é quem (nome/CPF/contato) e com que base (consentimento) —
 * cargo/empresa/placa e referências de documentos em campos custom são dados
 * pessoais sem finalidade após o evento. O vínculo com o stand permanece
 * relacional (standId), nada se perde para ocupação/relatórios.
 */
export const SENSITIVE_PARTICIPANT_CLEAR = {
  faceData: null,
  faceImageUrl: null,
  captureQuality: null,
  deviceInfo: null,
  captureLocation: null,
  browserInfo: null,
  documents: Prisma.DbNull,
  customData: Prisma.DbNull
} as const
