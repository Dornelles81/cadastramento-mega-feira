import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
// import './mega-feira-theme.css' // Temporarily disabled to avoid style conflicts

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter'
})

export const metadata: Metadata = {
  title: 'Mega Feira - Cadastro Facial',
  description: 'Sistema de cadastro com reconhecimento facial para eventos da Mega Feira',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon.svg',
    apple: '/icons/icon.svg',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': 'Mega Feira',
  }
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#7CC69B',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <head>
        <meta name="format-detection" content="telephone=no" />
        <meta name="msapplication-tap-highlight" content="no" />
      </head>
      <body className={`${inter.className} antialiased bg-feira-900 text-white`}>
        <Providers>
          <div className="min-h-screen">
            {children}
          </div>
        </Providers>

        {/* PWA Install Prompt */}
        <div id="install-prompt" className="hidden fixed bottom-4 left-4 right-4 bg-primary text-white p-4 rounded-lg shadow-lg glow-primary">
          <p className="text-sm mb-2">Instale este app para melhor experiência</p>
          <div className="flex gap-2">
            <button id="install-btn" className="bg-white text-primary-dark px-3 py-1 rounded text-sm font-medium">
              Instalar
            </button>
            <button id="dismiss-btn" className="bg-primary-dark px-3 py-1 rounded text-sm">
              Agora não
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}