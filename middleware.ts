import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

/**
 * Gate de NAVEGAÇÃO do painel (`/admin/*`).
 *
 * ── O que mudou em 04/09/2026: exceção → allowlist ─────────────────────────
 * Antes este arquivo negava POR EXCEÇÃO: desviava o OPERATOR para o controle de
 * acesso e liberava todo o resto para qualquer sessão. Quem ganhasse uma role
 * nova — um operador de balcão, por exemplo — caía no painel inteiro por
 * padrão, sem ninguém ter decidido isso. Uma lista de "quem não pode" erra
 * sempre para o lado errado: o papel criado amanhã não está nela.
 *
 * Agora cada role declara os prefixos que alcança, e o que não está declarado é
 * negado. Role desconhecida não navega em nada.
 *
 * ── O que este arquivo NÃO faz ────────────────────────────────────────────
 * O matcher é `/admin/:path*`, que NÃO cobre `/api/admin/*`. O middleware nunca
 * viu a superfície de API — cada rota se defende sozinha, com `withApiAuth` e
 * `hasEventPermission`. Esta allowlist conserta a navegação, não a exposição de
 * dados: esconder um link nunca impediu ninguém de chamar o endpoint. Se você
 * está aqui para proteger um dado, o lugar é a rota da API.
 */

interface AcessoDaRole {
  /** Prefixos alcançáveis. Casam com o caminho exato ou com o que vem abaixo dele. */
  permitido: string[]
  /** Para onde mandar quem tentou sair da própria área. */
  home: string
}

// Liberado para toda sessão autenticada, em qualquer role: sem isto, quem cai
// numa área negada e é mandado ao login entraria em laço.
const SEMPRE_LIBERADO = ['/admin/login']

// As páginas de `/admin/super/*` e `/admin/fields` são de SUPER_ADMIN e ficam de
// fora da lista do ADMIN de propósito — hoje elas já expulsam o ADMIN por um
// `router.push` no cliente, que esconde a tela sem impedir nada. Aqui vira
// barreira de verdade. As APIs por trás continuam com o seu próprio `isSuperAdmin`.
const AREA_ADMIN = [
  '/admin/dashboard',
  '/admin/eventos', // lista, evento, participantes, stands, terminais, aprovações
  '/admin/stands',
  '/admin/approvals',
  '/admin/documents',
  '/admin/logs',
  '/admin/access-control' // inclui /credentials, usada por ADMIN para as credenciais
]

const ACESSO: Record<string, AcessoDaRole> = {
  SUPER_ADMIN: { permitido: ['/admin'], home: '/admin/dashboard' },
  ADMIN: { permitido: AREA_ADMIN, home: '/admin/dashboard' },
  EVENT_ADMIN: { permitido: AREA_ADMIN, home: '/admin/dashboard' },
  // Portaria: entra no controle de acesso e em mais nada.
  OPERATOR: { permitido: ['/admin/access-control'], home: '/admin/access-control' }
}

/** Casa o caminho exato ou o que está abaixo dele — `/admin/stands` não pega `/admin/stands-x`. */
function dentroDe(pathname: string, prefixo: string): boolean {
  return pathname === prefixo || pathname.startsWith(prefixo + '/')
}

export default withAuth(
  function middleware(req) {
    const role = req.nextauth.token?.role as string | undefined
    const pathname = req.nextUrl.pathname

    if (SEMPRE_LIBERADO.some((p) => dentroDe(pathname, p))) {
      return NextResponse.next()
    }

    const acesso = role ? ACESSO[role] : undefined

    // Role ausente ou não declarada aqui: nega, e nega SEM redirecionar. Mandar
    // para uma home que ela também não alcança é laço; o 403 diz o que houve.
    if (!acesso) {
      return new NextResponse(
        'Acesso negado: este perfil não tem área no painel. Fale com a organização.',
        { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      )
    }

    if (acesso.permitido.some((p) => dentroDe(pathname, p))) {
      return NextResponse.next()
    }

    // Fora da área da role: manda para a home dela (mesma UX que o OPERATOR já
    // tinha ao cair no painel de admin).
    return NextResponse.redirect(new URL(acesso.home, req.url))
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
