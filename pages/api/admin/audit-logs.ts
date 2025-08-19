import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { action, entityType, entityId, limit = '100' } = req.query

    // Try to fetch logs using raw query since the model might not be generated yet
    try {
      // Check if audit_logs table exists
      const tableExists = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'audit_logs'
        ) as exists
      ` as any[]

      if (!tableExists || !tableExists[0]?.exists) {
        // Table doesn't exist yet, return empty array
        return res.status(200).json({ 
          success: true,
          logs: [],
          count: 0,
          message: 'Audit logs table not yet created'
        })
      }

      // Build WHERE clause
      let whereConditions = []
      let params = []
      
      if (action && typeof action === 'string') {
        whereConditions.push(`action = $${params.length + 1}`)
        params.push(action)
      }
      
      if (entityType && typeof entityType === 'string') {
        whereConditions.push(`"entityType" = $${params.length + 1}`)
        params.push(entityType)
      }
      
      if (entityId && typeof entityId === 'string') {
        whereConditions.push(`"entityId" = $${params.length + 1}`)
        params.push(entityId)
      }

      const whereClause = whereConditions.length > 0 
        ? `WHERE ${whereConditions.join(' AND ')}` 
        : ''

      // Fetch logs using raw query
      const logs = await prisma.$queryRawUnsafe(`
        SELECT 
          id,
          action,
          "entityType",
          "entityId",
          "adminUser",
          "adminIp",
          "previousData",
          "newData",
          changes,
          description,
          metadata,
          "createdAt"
        FROM audit_logs
        ${whereClause}
        ORDER BY "createdAt" DESC
        LIMIT ${parseInt(limit as string)}
      `, ...params)

      return res.status(200).json({ 
        success: true,
        logs: logs || [],
        count: (logs as any[])?.length || 0
      })
    } catch (queryError) {
      console.log('Audit logs table not available:', queryError)
      // Return empty logs if table doesn't exist
      return res.status(200).json({ 
        success: true,
        logs: [],
        count: 0
      })
    }
  } catch (error) {
    console.error('Error fetching audit logs:', error)
    return res.status(500).json({ error: 'Failed to fetch audit logs' })
  }
}