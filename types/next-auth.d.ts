import 'next-auth'

declare module 'next-auth' {
  interface User {
    id: string
    name: string
    email: string
    role: string
    avatar?: string | null
    events: Array<{
      id: string
      slug: string
      name: string
      code: string
      permissions: {
        canView: boolean
        canEdit: boolean
        canApprove: boolean
        canDelete: boolean
        canExport: boolean
        canManageStands: boolean
        canManageAdmins: boolean
      }
    }>
  }

  interface Session {
    user: {
      id: string
      name: string
      email: string
      role: string
      avatar?: string | null
      events: Array<{
        id: string
        slug: string
        name: string
        code: string
        permissions: {
          canView: boolean
          canEdit: boolean
          canApprove: boolean
          canDelete: boolean
          canExport: boolean
          canManageStands: boolean
          canManageAdmins: boolean
        }
      }>
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: string
    events: Array<{
      id: string
      slug: string
      name: string
      code: string
      permissions: {
        canView: boolean
        canEdit: boolean
        canApprove: boolean
        canDelete: boolean
        canExport: boolean
        canManageStands: boolean
        canManageAdmins: boolean
      }
    }>
  }
}
