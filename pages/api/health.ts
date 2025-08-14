import type { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface HealthResponse {
  status: 'healthy' | 'unhealthy'
  timestamp: string
  version: string
  checks: {
    database: 'ok' | 'error'
    environment: 'ok' | 'error'
  }
  stats?: {
    totalParticipants: number
    registrationsToday: number
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<HealthResponse>) {
  const timestamp = new Date().toISOString()
  
  let healthResponse: HealthResponse = {
    status: 'healthy',
    timestamp,
    version: '1.0.0',
    checks: {
      database: 'ok',
      environment: 'ok'
    }
  }

  try {
    // Check database connection
    await prisma.$connect()
    
    // Test database with simple query
    const totalParticipants = await prisma.participant.count()
    
    // Check registrations from today
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const registrationsToday = await prisma.participant.count({
      where: {
        createdAt: {
          gte: today
        }
      }
    })

    healthResponse.stats = {
      totalParticipants,
      registrationsToday
    }

    // Check required environment variables
    const requiredEnvVars = ['DATABASE_URL', 'MASTER_KEY']
    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar])
    
    if (missingEnvVars.length > 0) {
      healthResponse.checks.environment = 'error'
      healthResponse.status = 'unhealthy'
    }

  } catch (error) {
    console.error('Health check failed:', error)
    healthResponse.checks.database = 'error'
    healthResponse.status = 'unhealthy'
  } finally {
    await prisma.$disconnect()
  }

  // Return appropriate HTTP status code
  const statusCode = healthResponse.status === 'healthy' ? 200 : 503

  res.status(statusCode).json(healthResponse)
}