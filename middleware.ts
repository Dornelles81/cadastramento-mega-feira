import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const pathname = req.nextUrl.pathname

    // Operadores só podem acessar a página de controle de acesso
    if (
      token?.role === 'OPERATOR' &&
      !pathname.startsWith('/admin/access-control') &&
      pathname !== '/admin/login'
    ) {
      return NextResponse.redirect(new URL('/admin/access-control', req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token
    },
    pages: {
      signIn: '/admin/login'
    }
  }
)

export const config = {
  matcher: [
    '/admin/:path*'
  ]
}
