import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'
import bcrypt from 'bcrypt'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../auth/[...nextauth]'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check authentication
  const session = await getServerSession(req, res, authOptions)

  if (!session || session.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Forbidden', message: 'Super Admin access required' })
  }

  if (req.method === 'GET') {
    // List all event admins
    try {
      const admins = await prisma.eventAdmin.findMany({
        include: {
          events: {
            include: {
              event: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                  slug: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      return res.status(200).json({ admins })
    } catch (error: any) {
      console.error('Error fetching admins:', error)
      return res.status(500).json({ error: 'Internal server error', message: error.message })
    }
  }

  if (req.method === 'POST') {
    // Create new event admin
    try {
      const { email, password, name, role = 'ADMIN' } = req.body

      // Validate required fields
      if (!email || !password || !name) {
        return res.status(400).json({ error: 'Bad request', message: 'Email, password, and name are required' })
      }

      // Check if email already exists
      const existingAdmin = await prisma.eventAdmin.findUnique({
        where: { email }
      })

      if (existingAdmin) {
        return res.status(400).json({ error: 'Bad request', message: 'Email already in use' })
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10)

      // Create admin
      const admin = await prisma.eventAdmin.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role: role as 'ADMIN' | 'SUPER_ADMIN',
          isActive: true
        }
      })

      // Remove password from response
      const { password: _, ...adminWithoutPassword } = admin

      return res.status(201).json({ admin: adminWithoutPassword })
    } catch (error: any) {
      console.error('Error creating admin:', error)
      return res.status(500).json({ error: 'Internal server error', message: error.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
