import { getServerSession } from 'next-auth/next'
import { authOptions } from '../pages/api/auth/[...nextauth]'
import { GetServerSidePropsContext, NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Get session from API route or getServerSideProps
 */
export async function getSession(
  req: NextApiRequest | GetServerSidePropsContext['req'],
  res?: NextApiResponse | GetServerSidePropsContext['res']
) {
  return await getServerSession(req as any, res as any, authOptions)
}

/**
 * Require authentication - throws if not authenticated
 */
export async function requireAuth(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getSession(req, res)

  if (!session || !session.user) {
    throw new Error('Não autenticado')
  }

  return session
}

/**
 * Check if user has access to a specific event
 */
export async function checkEventAccess(
  session: any,
  eventSlug: string,
  permission?: keyof {
    canView: boolean
    canEdit: boolean
    canApprove: boolean
    canDelete: boolean
    canExport: boolean
    canManageStands: boolean
    canManageAdmins: boolean
  }
) {
  // Super admin has access to everything
  if (session.user.role === 'SUPER_ADMIN') {
    return true
  }

  // Find event in user's events
  const eventAccess = session.user.events?.find(
    (e: any) => e.slug === eventSlug
  )

  if (!eventAccess) {
    return false
  }

  // If specific permission is required, check it
  if (permission) {
    return eventAccess.permissions[permission] === true
  }

  // Default: user has some access to the event
  return true
}

/**
 * Require access to a specific event
 * Returns event data if access is granted, throws otherwise
 */
export async function requireEventAccess(
  req: NextApiRequest,
  res: NextApiResponse,
  eventSlug: string,
  permission?: keyof {
    canView: boolean
    canEdit: boolean
    canApprove: boolean
    canDelete: boolean
    canExport: boolean
    canManageStands: boolean
    canManageAdmins: boolean
  }
) {
  const session = await requireAuth(req, res)

  // Get event from database
  const event = await prisma.event.findUnique({
    where: { slug: eventSlug }
  })

  if (!event) {
    throw new Error('Evento não encontrado')
  }

  // Check access
  const hasAccess = await checkEventAccess(session, eventSlug, permission)

  if (!hasAccess) {
    const permissionName = permission || 'acesso'
    throw new Error(`Sem permissão: ${permissionName}`)
  }

  return {
    session,
    event,
    admin: session.user
  }
}

/**
 * Check if user is super admin
 */
export function isSuperAdmin(session: any): boolean {
  return session?.user?.role === 'SUPER_ADMIN'
}

/**
 * Get all events accessible by the user
 */
export function getAccessibleEvents(session: any) {
  if (isSuperAdmin(session)) {
    // Super admin: fetch all events from database
    return prisma.event.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' }
    })
  }

  // Regular admin: return only assigned events
  return session?.user?.events || []
}

/**
 * Create audit log for an action
 */
export async function createAuditLog(data: {
  adminId: string
  eventId?: string
  action: string
  entityType: string
  entityId?: string
  description: string
  metadata?: any
  severity?: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'
}) {
  return await prisma.auditLog.create({
    data: {
      ...data,
      severity: data.severity || 'INFO',
      createdAt: new Date()
    }
  })
}
