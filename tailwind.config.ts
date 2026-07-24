import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/hooks/**/*.{ts,tsx}',
    './src/lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#07090f',
          900: '#0b0e16',
          850: '#0f1320',
          800: '#141928',
          750: '#1a2032',
          700: '#212940',
          600: '#2c3550',
          500: '#3b465f',
        },
        accent: {
          DEFAULT: '#6ea8fe',
          soft: '#8fc0ff',
          deep: '#3b6fd4',
        },
        quality: {
          brilliant: '#26c6da',
          great: '#5b8def',
          best: '#7fce6b',
          excellent: '#95d47a',
          good: '#a8c98f',
          book: '#b9a37e',
          forced: '#9aa3b2',
          inaccuracy: '#f2c14e',
          mistake: '#f08c3a',
          blunder: '#e5484d',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        chess: ['"Segoe UI Symbol"', '"Noto Sans Symbols 2"', '"DejaVu Sans"', 'serif'],
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 18px 45px -20px rgba(0,0,0,0.9)',
        glow: '0 0 0 1px rgba(110,168,254,0.35), 0 0 28px -4px rgba(110,168,254,0.45)',
        board: '0 30px 70px -30px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.06)',
      },
      backgroundImage: {
        'grid-fade':
          'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(110,168,254,0.16), transparent 65%)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.85)', opacity: '0.85' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-500px 0' },
          '100%': { backgroundPosition: '500px 0' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.4s cubic-bezier(0.4,0,0.2,1) infinite',
        shimmer: 'shimmer 1.8s linear infinite',
        'fade-up': 'fade-up 0.25s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
