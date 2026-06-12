/** @type {import('next').NextConfig} */
const nextConfig = {
  // Development optimization
  reactStrictMode: true,

  // Skip type checking during build (for Vercel)
  typescript: {
    ignoreBuildErrors: true,
  },

  // Enable Turbopack (Next.js 16 default)
  turbopack: {},

  // PWA for mobile experience
  async headers() {
    return [
      {
        // Painel do stand: dados pessoais atrás de link mágico — nunca cachear
        source: '/stand/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          // Camera permissions for mobile
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=()',
          },
          // HTTPS obrigatório (HSTS)
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
          // CSP: 'unsafe-inline'/'unsafe-eval' ainda necessários para Next.js + MediaPipe;
          // endurecer com nonces na Fase 2
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "media-src 'self' blob:",
              "connect-src 'self' https://cdn.jsdelivr.net https://*.cognitiveservices.azure.com",
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ]
  },

  // Compatibilidade: caminhos legados /uploads/* gravados no banco
  // continuam funcionando via rota autenticada /api/uploads/*
  async rewrites() {
    return [
      {
        source: '/uploads/:filename',
        destination: '/api/uploads/:filename',
      },
    ]
  },

  // Image optimization for mobile (using remotePatterns instead of deprecated domains)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
    formats: ['image/webp', 'image/avif'],
  },
}

module.exports = nextConfig
