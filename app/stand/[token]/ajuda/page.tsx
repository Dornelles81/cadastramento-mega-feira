import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '../../../../lib/prisma'
import { checkRateLimit } from '../../../../lib/rate-limit'
import { validateStandToken } from '../../../../lib/stand-access/validate'

// Página de ajuda do painel do responsável: mesma validação de token do
// painel; nenhum dado de participantes nem de outros stands é exposto.

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Como funciona — Mega Credenciamento',
  robots: { index: false, follow: false }
}

const NAVY = '#1E3A5F'
const TEAL = '#2DD4BF'

function Section({
  icon,
  title,
  children
}: {
  icon: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl shadow p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-2">
        <span className="mr-2">{icon}</span>
        {title}
      </h2>
      <div className="text-sm text-gray-700 leading-relaxed space-y-3">{children}</div>
    </section>
  )
}

export default async function StandAjudaPage({
  params
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const hdrs = await headers()
  const ip = (hdrs.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
  if (!checkRateLimit(`stand-panel:${ip}`, 30, 60_000)) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Muitas tentativas</h1>
          <p className="text-gray-600">Aguarde alguns instantes e tente novamente.</p>
        </div>
      </main>
    )
  }

  const access = await validateStandToken(token)
  if (!access) notFound()

  const event = access.event.id
    ? await prisma.event.findUnique({
        where: { id: access.event.id },
        select: { dayResetHour: true, substitutionQuotaEnabled: true, substitutionsPerSlot: true }
      })
    : null
  const resetLabel = `${event?.dayResetHour ?? 4}h`
  const quotaEnabled = !!event?.substitutionQuotaEnabled
  const quotaTotal = access.stand.maxRegistrations * (event?.substitutionsPerSlot ?? 1)

  return (
    <main className="min-h-screen bg-gray-50">
      <header style={{ backgroundColor: NAVY }} className="px-4 py-6">
        <div className="max-w-3xl mx-auto">
          <p style={{ color: TEAL }} className="text-sm font-semibold">
            {access.event.name}
          </p>
          <h1 className="text-2xl font-bold text-white mt-1">
            Como funciona o credenciamento do seu stand
          </h1>
          <p className="text-sm text-gray-300 mt-1">{access.stand.name}</p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <Section icon="🔑" title="Seu link é a chave">
          <p>
            O link que você recebeu por e-mail dá acesso só ao <strong>seu</strong> stand —
            ninguém vê os dados de outro expositor, e você não vê os dos demais. Guarde bem e
            compartilhe apenas com pessoas de confiança da sua equipe: quem tem o link consegue
            cadastrar e excluir participantes do stand.
          </p>
          <p>
            Perdeu o link ou acha que ele vazou? Fale com a organização — a gente revoga o
            antigo e envia um novo na hora.
          </p>
        </Section>

        <Section icon="✅" title="Cadastrando sua equipe">
          <p>
            Toque em <strong>Cadastrar credenciado</strong> ou encaminhe o link para a própria
            pessoa se cadastrar pelo celular dela. O cadastro pede os dados pessoais e uma foto
            do rosto — é ela que libera a entrada nas catracas com reconhecimento facial, então
            capricha: rosto de frente, sem boné e sem óculos escuros, em lugar iluminado.
          </p>
        </Section>

        <Section icon="📊" title="Acompanhando as vagas">
          <p>
            O painel mostra em tempo real quantas vagas estão ocupadas e quem está cadastrado. O
            número de vagas do seu stand é o contratado com a organização do evento.
          </p>
        </Section>

        <Section icon="🔄" title="Trocando alguém da equipe">
          <p>
            Precisou substituir uma pessoa? Toque em <strong>Excluir</strong> ao lado do nome,
            confirme, e a vaga abre para um novo cadastro. A pessoa excluída perde o acesso ao
            evento imediatamente e os dados da foto dela são apagados do sistema.
          </p>
          <p>
            <strong>Atenção à regra da troca:</strong> se a pessoa excluída{' '}
            <strong>já entrou no evento naquele dia</strong>, a vaga só fica disponível para um
            novo cadastro <strong>a partir das {resetLabel} da manhã do dia seguinte</strong>.
            Se ela ainda não tinha acessado no dia, a vaga libera na hora. O próprio painel
            avisa qual é o caso antes de você confirmar a exclusão.
          </p>
          <blockquote
            className="border-l-4 pl-4 py-2 bg-gray-50 rounded-r-lg text-gray-600"
            style={{ borderColor: TEAL }}
          >
            Por que essa regra existe? As credenciais do stand são pessoais e servem para a
            equipe que trabalha nele. A regra garante que cada vaga corresponda a uma pessoa por
            dia, como previsto no contrato do evento.
          </blockquote>
        </Section>

        {quotaEnabled && (
          <Section icon="📌" title="Limite de trocas">
            <p>
              Durante o evento, seu stand tem direito a <strong>{quotaTotal} substituições</strong>{' '}
              no total (o contador aparece no painel). Precisando de mais, fale com a
              organização.
            </p>
          </Section>
        )}

        <Section icon="🔒" title="Privacidade e segurança">
          <p>
            Todos os cadastros, acessos e exclusões ficam registrados. As fotos faciais são
            armazenadas criptografadas e apagadas automaticamente após o evento, conforme a
            LGPD. Ao excluir alguém, os dados sensíveis dele são removidos na hora.
          </p>
        </Section>

        <Section icon="💬" title="Precisa de ajuda?">
          <p>
            Fale com a organização do evento pelos canais informados no seu e-mail de
            credenciamento.
          </p>
        </Section>

        <Link
          href={`/stand/${token}`}
          style={{ backgroundColor: TEAL, color: NAVY }}
          className="block w-full text-center px-6 py-3 rounded-xl font-bold hover:opacity-90 transition-opacity"
        >
          ← Voltar ao painel do stand
        </Link>

        <p className="text-xs text-gray-400 text-center pb-6">
          Este painel é exclusivo do seu stand. Em caso de dúvidas, contate a organização do
          evento.
        </p>
      </div>
    </main>
  )
}
