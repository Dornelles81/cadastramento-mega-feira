/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Mobile-first custom spacing
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
      
      // Mega Feira brand colors - Nova Paleta
      colors: {
        // Primary - Verde-água principal
        'primary': {
          DEFAULT: '#47d7ac',
          light: '#6ee5c0',
          dark: '#2db88f',
          50: '#ecfdf8',
          100: '#d1fae8',
          200: '#a7f3d5',
          300: '#6ee5c0',
          400: '#47d7ac',
          500: '#2db88f',
          600: '#27a37a',
          700: '#208265',
          800: '#1a6650',
          900: '#155340',
        },
        // Purple - Roxo Escuro secundário
        'purple': {
          DEFAULT: '#500778',
          light: '#7b2bb3',
          dark: '#3a0556',
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#9C27B0',  // Roxo claro
          500: '#6A1B9A',  // Roxo médio
          600: '#7b2bb3',  // Purple Light
          700: '#500778',  // Purple principal
          800: '#3a0556',  // Purple Dark
          900: '#2a0340',
        },
        // Verde Neon - Destaque
        'neon': {
          DEFAULT: '#2DD4BF',
          50: '#ecfdf8',
          100: '#d1fae8',
          200: '#a7f3d5',
          300: '#6ee5c0',
          400: '#47d7ac',
          500: '#2DD4BF',
          600: '#14b8a6',
          700: '#0d9488',
          800: '#0f766e',
          900: '#115e59',
        },
        // Mega brand (alias para primary)
        'mega': {
          50: '#ecfdf8',
          100: '#d1fae8',
          200: '#a7f3d5',
          300: '#6ee5c0',
          400: '#47d7ac',
          500: '#2DD4BF',  // Verde Neon
          600: '#2db88f',
          700: '#27a37a',
          800: '#208265',
          900: '#155340',
        },
        // Feira - Dark theme colors
        'feira': {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#0f0f1a',  // Escuro principal
          900: '#0f172a',  // Fundo body dark
        },
        // Verde alternativo
        'green': {
          DEFAULT: '#2E7D32',
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3cf',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10B981',
          600: '#059669',
          700: '#2E7D32',
          800: '#166534',
          900: '#14532d',
        },
        // Semantic colors
        'success': {
          DEFAULT: '#47d7ac',
          light: '#6ee5c0',
          dark: '#2db88f',
          50: '#ecfdf8',
          500: '#47d7ac',
          600: '#2db88f',
          700: '#27a37a',
          800: '#208265',
        },
        // WhatsApp colors
        'whatsapp': {
          DEFAULT: '#25D366',
          hover: '#20BA5C',
        },
        // Dark mode colors
        'dark': {
          bg: '#0f172a',
          text: '#f8fafc',
          muted: '#ccc',
          subtle: '#666',
        },
      },
      
      // Mobile-optimized font sizes
      fontSize: {
        'mobile-xs': ['12px', '16px'],
        'mobile-sm': ['14px', '20px'],
        'mobile-base': ['16px', '24px'],
        'mobile-lg': ['18px', '28px'],
        'mobile-xl': ['20px', '28px'],
      },
      
      // Animation for smooth mobile interactions
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-in-out',
        'pulse-slow': 'pulse 2s infinite',
      },
      
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        }
      }
    },
  },
  plugins: [],
}