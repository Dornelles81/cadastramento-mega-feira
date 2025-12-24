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
      
      // Mega Feira brand colors - Identidade Visual Oficial
      colors: {
        // CORES PRINCIPAIS
        // Verde Mega Feira - Logo "MEGA", destaques, CTAs, acentos
        'verde-mega': {
          DEFAULT: '#7CC69B',
          light: '#9DD4B3',
          dark: '#5CB882',
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#9DD4B3',
          400: '#7CC69B',
          500: '#5CB882',
          600: '#4ade80',
          700: '#22c55e',
          800: '#16a34a',
          900: '#15803d',
        },
        // Verde-água (legacy alias for backward compatibility)
        'verde-agua': {
          DEFAULT: '#7CC69B',
          light: '#9DD4B3',
          dark: '#5CB882',
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#9DD4B3',
          400: '#7CC69B',
          500: '#5CB882',
          600: '#4ade80',
          700: '#22c55e',
          800: '#16a34a',
          900: '#15803d',
        },
        // Azul marinho - Logo "FEIRA", títulos, fundos escuros
        'azul-marinho': {
          DEFAULT: '#1E3A5F',
          light: '#2c5282',
          dark: '#1a365d',
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1E3A5F',
          800: '#1a365d',
          900: '#1e3a8a',
        },
        // Primary alias para verde Mega Feira
        'primary': {
          DEFAULT: '#7CC69B',
          light: '#9DD4B3',
          dark: '#5CB882',
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#9DD4B3',
          400: '#7CC69B',
          500: '#5CB882',
          600: '#4ade80',
          700: '#22c55e',
          800: '#16a34a',
          900: '#15803d',
        },
        // CORES SECUNDÁRIAS
        // Azul médio - Gradientes, botões secundários
        'azul-medio': {
          DEFAULT: '#2563EB',
          light: '#3b82f6',
          dark: '#1d4ed8',
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#2563EB',
          600: '#1d4ed8',
          700: '#1e40af',
          800: '#1e3a8a',
          900: '#172554',
        },
        // Verde - Credenciamento, sucesso
        'verde': {
          DEFAULT: '#10B981',
          light: '#34d399',
          dark: '#059669',
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        // Cinza - Tagline, textos secundários
        'cinza': {
          DEFAULT: '#64748B',
          light: '#94a3b8',
          dark: '#475569',
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
        // FUNDOS
        'fundo': {
          claro: '#F8FAFC',      // Fundo principal (light mode)
          medio: '#E2E8F0',      // Gradiente de fundo
        },
        // Mega brand (verde Mega Feira)
        'mega': {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#9DD4B3',
          400: '#7CC69B',
          500: '#5CB882',
          600: '#4ade80',
          700: '#22c55e',
          800: '#16a34a',
          900: '#15803d',
        },
        // Feira (azul marinho)
        'feira': {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1E3A5F',
          800: '#1a365d',
          900: '#1e3a8a',
        },
        // Semantic colors
        'success': {
          DEFAULT: '#10B981',
          light: '#34d399',
          dark: '#059669',
          50: '#ecfdf5',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
        },
        // WhatsApp colors
        'whatsapp': {
          DEFAULT: '#25D366',
          hover: '#20BA5C',
        },
        // Dark mode colors
        'dark': {
          bg: '#1E3A5F',
          text: '#f8fafc',
          muted: '#94a3b8',
          subtle: '#64748b',
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