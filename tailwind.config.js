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
        // Verde Mega Feira - Pantone 7472C (#5EC2B7) - Logo "MEGA", destaques, CTAs, acentos
        'verde-mega': {
          DEFAULT: '#5EC2B7',
          light: '#80D4CA',
          dark: '#3DA39B',
          50: '#f0faf9',
          100: '#d1f4f1',
          200: '#a3e9e3',
          300: '#75ded5',
          400: '#5EC2B7',
          500: '#3DA39B',
          600: '#2D837C',
          700: '#1E635D',
          800: '#0E423E',
          900: '#04211F',
        },
        // Verde-água (legacy alias for backward compatibility)
        'verde-agua': {
          DEFAULT: '#5EC2B7',
          light: '#80D4CA',
          dark: '#3DA39B',
          50: '#f0faf9',
          100: '#d1f4f1',
          200: '#a3e9e3',
          300: '#75ded5',
          400: '#5EC2B7',
          500: '#3DA39B',
          600: '#2D837C',
          700: '#1E635D',
          800: '#0E423E',
          900: '#04211F',
        },
        // Azul marinho - Pantone 534C (#1F3664) - Logo "FEIRA", títulos, fundos escuros
        'azul-marinho': {
          DEFAULT: '#1F3664',
          light: '#2D4E8A',
          dark: '#152347',
          50: '#eef1f8',
          100: '#d4dcef',
          200: '#a9b9e0',
          300: '#7e96d0',
          400: '#5373c1',
          500: '#3258AA',
          600: '#284487',
          700: '#1F3664',
          800: '#152347',
          900: '#0C122C',
        },
        // Primary alias para verde Mega Feira (Pantone 7472C)
        'primary': {
          DEFAULT: '#5EC2B7',
          light: '#80D4CA',
          dark: '#3DA39B',
          50: '#f0faf9',
          100: '#d1f4f1',
          200: '#a3e9e3',
          300: '#75ded5',
          400: '#5EC2B7',
          500: '#3DA39B',
          600: '#2D837C',
          700: '#1E635D',
          800: '#0E423E',
          900: '#04211F',
        },
        // CORES SECUNDÁRIAS
        // Azul médio - Gradientes, botões secundários (derivado do Pantone 534C)
        'azul-medio': {
          DEFAULT: '#3258AA',
          light: '#5373c1',
          dark: '#284487',
          50: '#eef1f8',
          100: '#d4dcef',
          200: '#a9b9e0',
          300: '#7e96d0',
          400: '#5373c1',
          500: '#3258AA',
          600: '#284487',
          700: '#1F3664',
          800: '#152347',
          900: '#0C122C',
        },
        // Verde - Credenciamento, sucesso (Pantone 7472C)
        'verde': {
          DEFAULT: '#5EC2B7',
          light: '#80D4CA',
          dark: '#3DA39B',
          50: '#f0faf9',
          100: '#d1f4f1',
          200: '#a3e9e3',
          300: '#75ded5',
          400: '#5EC2B7',
          500: '#3DA39B',
          600: '#2D837C',
          700: '#1E635D',
          800: '#0E423E',
          900: '#04211F',
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
        // Mega brand (Pantone 7472C)
        'mega': {
          50: '#f0faf9',
          100: '#d1f4f1',
          200: '#a3e9e3',
          300: '#75ded5',
          400: '#5EC2B7',
          500: '#3DA39B',
          600: '#2D837C',
          700: '#1E635D',
          800: '#0E423E',
          900: '#04211F',
        },
        // Feira (Pantone 534C)
        'feira': {
          50: '#eef1f8',
          100: '#d4dcef',
          200: '#a9b9e0',
          300: '#7e96d0',
          400: '#5373c1',
          500: '#3258AA',
          600: '#284487',
          700: '#1F3664',
          800: '#152347',
          900: '#0C122C',
        },
        // Semantic colors
        'success': {
          DEFAULT: '#5EC2B7',
          light: '#80D4CA',
          dark: '#3DA39B',
          50: '#f0faf9',
          500: '#5EC2B7',
          600: '#3DA39B',
          700: '#2D837C',
          800: '#1E635D',
        },
        // WhatsApp colors
        'whatsapp': {
          DEFAULT: '#25D366',
          hover: '#20BA5C',
        },
        // Dark mode colors
        'dark': {
          bg: '#1F3664',
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