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
        ],
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
