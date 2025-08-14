import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import './mega-feira-theme.css'

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter'
})

export const metadata: Metadata = {
  title: 'Cadastro Mega Feira - Reconhecimento Facial',
  description: 'Sistema de cadastro com reconhecimento facial para eventos da Mega Feira',
  manifest: '/manifest.json',
  themeColor: '#7CC69B',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: 'cover'
  },
  icons: {
    icon: '/mega-feira-logo.svg',
    apple: '/mega-feira-logo.svg',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': 'Mega Feira',
  }
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
      <body className={`${inter.className} antialiased bg-gray-50 text-gray-900`}>
        <div className="min-h-screen pb-safe-bottom pt-safe-top">
          <main className="container mx-auto px-4 py-6 max-w-lg">
            {children}
          </main>
        </div>
        
        {/* PWA Install Prompt */}
        <div id="install-prompt" className="hidden fixed bottom-4 left-4 right-4 bg-mega-500 text-white p-4 rounded-lg shadow-lg">
          <p className="text-sm mb-2">Instale este app para melhor experiência</p>
          <div className="flex gap-2">
            <button id="install-btn" className="bg-white text-mega-600 px-3 py-1 rounded text-sm font-medium">
              Instalar
            </button>
            <button id="dismiss-btn" className="bg-mega-600 px-3 py-1 rounded text-sm">
              Agora não
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}