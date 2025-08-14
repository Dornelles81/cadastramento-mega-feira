import type { NextApiRequest, NextApiResponse } from 'next'

interface HealthResponse {
  status: 'healthy'
  timestamp: string
  version: string
  mode: 'development'
  checks: {
    database: 'mock'
    environment: 'ok'
  }
  stats: {
    totalParticipants: number
    registrationsToday: number
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<HealthResponse>) {
  const timestamp = new Date().toISOString()
  
  // Mock statistics for development
  const mockStats = {
    totalParticipants: Math.floor(Math.random() * 500) + 100,
    registrationsToday: Math.floor(Math.random() * 50) + 10
  }
  
  const healthResponse: HealthResponse = {
    status: 'healthy',
    timestamp,
    version: '1.0.0-dev',
    mode: 'development',
    checks: {
      database: 'mock',
      environment: 'ok'
    },
    stats: mockStats
  }

  console.log('🏥 Health check (development mode):', healthResponse)

  res.status(200).json(healthResponse)
}