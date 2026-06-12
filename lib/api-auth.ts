/**
 * Wrapper de autenticação para rotas de API (Pages Router).
 *
 * Uso:
 *   export default withApiAuth(handler)                          // qualquer usuário autenticado
 *   export default withApiAuth(handler, { roles: ADMIN_ROLES })  // apenas admins
 *
 * O handler recebe a sessão como terceiro argumento.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import type { Session } from 'next-auth'
import { authOptions } from '../pages/api/auth/[...nextauth]'

// Roles reais em uso no banco: SUPER_ADMIN, ADMIN, EVENT_ADMIN, OPERATOR
export const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'EVENT_ADMIN']
export const OPERATOR_ROLES = ['SUPER_ADMIN', 'ADMIN', 'EVENT_ADMIN', 'OPERATOR']

export type AuthedHandler = (
  req: NextApiRequest,
  res: NextApiResponse,
  session: Session
) => unknown | Promise<unknown>

export interface WithApiAuthOptions {
  /** Roles permitidas. Se omitido, qualquer usuário autenticado tem acesso. */
  roles?: string[]
}

export function withApiAuth(handler: AuthedHandler, options?: WithApiAuthOptions) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const session = await getServerSession(req, res, authOptions)

    if (!session?.user) {
      return res.status(401).json({ error: 'Não autenticado' })
    }

    const role = (session.user as any).role as string | undefined
    if (options?.roles && (!role || !options.roles.includes(role))) {
      return res.status(403).json({ error: 'Sem permissão para esta operação' })
    }

    return handler(req, res, session)
  }
}

/**
 * Verifica permissão granular do usuário em um evento específico.
 * SUPER_ADMIN tem acesso a tudo.
 */
export function hasEventPermission(
  session: Session,
  eventSlugOrId: string,
  permission?:
    | 'canView'
    | 'canEdit'
    | 'canApprove'
    | 'canDelete'
    | 'canExport'
    | 'canManageStands'
    | 'canManageAdmins'
): boolean {
  const user = session.user as any
  if (user?.role === 'SUPER_ADMIN') return true

  const access = user?.events?.find(
    (e: any) => e.slug === eventSlugOrId || e.id === eventSlugOrId
  )
  if (!access) return false
  if (!permission) return true
  return access.permissions?.[permission] === true
}
