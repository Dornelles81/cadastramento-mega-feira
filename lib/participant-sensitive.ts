/**
 * Conjunto único de campos sensíveis a limpar quando um participante é
 * removido ou expurgado (LGPD): biometria facial, documentos e metadados de
 * captura. Usado pela exclusão via stand (Fase 5) e pelo cron de expurgo
 * (lgpd-purge) para garantir que ambos apaguem exatamente o mesmo conjunto.
 */
export const SENSITIVE_PARTICIPANT_CLEAR = {
  faceData: null,
  faceImageUrl: null,
  captureQuality: null,
  deviceInfo: null,
  documents: {}
} as const
