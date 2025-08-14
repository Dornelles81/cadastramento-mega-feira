/** @type {import('next').NextConfig} */
const nextConfig = {
  // Development optimization
  reactStrictMode: true,
  swcMinify: true,
  
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

  // Image optimization for mobile
  images: {
    domains: ['your-domain.com'],
    formats: ['image/webp', 'image/avif'],
  },

  // Webpack config for MediaPipe
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      }
    }
    return config
  },
}

module.exports = nextConfig