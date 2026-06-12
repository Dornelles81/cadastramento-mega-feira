import { NextApiRequest, NextApiResponse } from 'next';

/**
 * DESATIVADO (SPEC acesso-por-stand): a listagem pública de stands foi
 * removida. O cadastro vinculado a stand é feito exclusivamente pelo link
 * mágico enviado ao responsável (/stand/[token]), que não expõe os demais
 * stands. Endpoint mantido apenas para responder de forma clara a clientes
 * antigos.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  res.status(410).json({
    error: 'Gone',
    message:
      'A listagem pública de stands foi desativada. O cadastro agora é feito pelo link enviado ao responsável do seu stand.'
  });
}
