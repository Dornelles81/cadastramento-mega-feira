import NextAuth, { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email e senha são obrigatórios')
        }

        // Find admin by email
        const admin = await prisma.eventAdmin.findUnique({
          where: { email: credentials.email },
          include: {
            events: {
              where: { isActive: true },
              include: {
                event: {
                  select: {
                    id: true,
                    slug: true,
                    name: true,
                    code: true,
                    status: true,
                    isActive: true,
                    _count: {
                      select: {
                        participants: true
                      }
                    }
                  }
                }
              }
            }
          }
        })

        if (!admin) {
          throw new Error('Credenciais inválidas')
        }

        if (!admin.isActive) {
          throw new Error('Conta desativada. Contate o administrador.')
        }

        // Check if account is locked
        if (admin.lockedUntil && admin.lockedUntil > new Date()) {
          const minutesLeft = Math.ceil(
            (admin.lockedUntil.getTime() - new Date().getTime()) / 60000
          )
          throw new Error(
            `Conta bloqueada temporariamente. Tente novamente em ${minutesLeft} minuto(s).`
          )
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(
          credentials.password,
          admin.password
        )

        if (!isValidPassword) {
          // Increment login attempts
          const newAttempts = admin.loginAttempts + 1
          const shouldLock = newAttempts >= 5

          await prisma.eventAdmin.update({
            where: { id: admin.id },
            data: {
              loginAttempts: newAttempts,
              lockedUntil: shouldLock
                ? new Date(Date.now() + 15 * 60 * 1000) // Lock for 15 minutes
                : null
            }
          })

          if (shouldLock) {
            throw new Error(
              'Muitas tentativas falhas. Conta bloqueada por 15 minutos.'
            )
          }

          throw new Error('Credenciais inválidas')
        }

        // Reset login attempts and update last login
        await prisma.eventAdmin.update({
          where: { id: admin.id },
          data: {
            loginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
            lastLoginIp: null // Will be set by audit log
          }
        })

        // Create audit log
        await prisma.auditLog.create({
          data: {
            adminId: admin.id,
            adminEmail: admin.email,
            action: 'LOGIN',
            entityType: 'admin',
            entityId: admin.id,
            description: `Admin ${admin.name} logged in`,
            severity: 'INFO'
          }
        })

        // Return user object for session
        return {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          avatar: admin.avatar,
          events: admin.events.map((access) => ({
            id: access.event.id,
            slug: access.event.slug,
            name: access.event.name,
            code: access.event.code,
            _count: access.event._count,
            permissions: {
              canView: access.canView,
              canEdit: access.canEdit,
              canApprove: access.canApprove,
              canDelete: access.canDelete,
              canExport: access.canExport,
              canManageStands: access.canManageStands,
              canManageAdmins: access.canManageAdmins
            }
          }))
        }
      }
    })
  ],

  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60 // 24 hours
  },

  pages: {
    signIn: '/admin/login',
    error: '/admin/login'
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.events = user.events
      }
      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.events = token.events as any
      }
      return session
    }
  },

  secret: process.env.NEXTAUTH_SECRET || 'mega-feira-secret-change-in-production',

  debug: process.env.NODE_ENV === 'development'
}

export default NextAuth(authOptions)
