import { notFound } from 'next/navigation'
import { validarBalcao } from '../../../lib/balcao/acesso'
import BalcaoRecoleta from '../../../components/balcao/BalcaoRecoleta'

// Balcão de recoleta facial da feira. O link é a credencial: validado no
// servidor a cada abertura e em cada chamada das rotas /api/balcao/[token]/*.
// Inválido, revogado ou expirado → 404, sem dizer qual.

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Balcão de foto — Mega Credenciamento',
  robots: { index: false, follow: false }
}

export default async function BalcaoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const acesso = await validarBalcao(token)
  if (!acesso) notFound()
  return <BalcaoRecoleta token={token} evento={acesso.event.name} operador={acesso.label} />
}
