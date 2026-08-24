import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /**
         * Surface ramp, light-first: `ink-50` is the darkest (body copy) and the
         * high numbers are the lightest (page and card surfaces). Components read
         * as "low number = strong ink, high number = paper".
         */
        ink: {
          50: '#0d1b2a',
          100: '#243447',
          200: '#3d4d61',
          300: '#556479',
          400: '#a9b6c6',
          500: '#e2e9f1',
          600: '#ffffff',
          700: '#eef2f7',
          800: '#ffffff',
          900: '#f5f8fb',
          950: '#e8eef5',
        },
        primary: {
          50: '#eef4ff',
          100: '#d9e6ff',
          200: '#b3ccff',
          300: '#7ba7fb',
          400: '#3b82f6',
          500: '#1d64d8',
          600: '#1552b8',
          700: '#0f4092',
          800: '#0c3372',
        },
        secondary: {
          50: '#fff8e8',
          100: '#fde3a7',
          200: '#8a5a00',
          300: '#8f5a08',
          400: '#9a5c05',
          500: '#f0a52a',
          600: '#d98614',
        },
        success: {
          500: '#0a8f5a',
          600: '#07714a',
        },
        error: {
          500: '#c62a1d',
          600: '#a11f15',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.92)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-5px)' },
          '40%': { transform: 'translateX(5px)' },
          '60%': { transform: 'translateX(-3px)' },
          '80%': { transform: 'translateX(3px)' },
        },
        'flash-up': {
          '0%': { backgroundColor: 'rgba(10,143,90,0.28)' },
          '100%': { backgroundColor: 'transparent' },
        },
        'flash-down': {
          '0%': { backgroundColor: 'rgba(217,45,32,0.24)' },
          '100%': { backgroundColor: 'transparent' },
        },
        'pulse-live': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out both',
        'scale-in': 'scale-in 160ms cubic-bezier(0.2,0.8,0.3,1) both',
        'slide-up': 'slide-up 220ms cubic-bezier(0.2,0.8,0.3,1) both',
        'sheet-up': 'sheet-up 260ms cubic-bezier(0.32,0.72,0.25,1) both',
        shake: 'shake 320ms ease-in-out both',
        'flash-up': 'flash-up 1200ms ease-out both',
        'flash-down': 'flash-down 1200ms ease-out both',
        'pulse-live': 'pulse-live 1.4s ease-in-out infinite',
        shimmer: 'shimmer 1.4s linear infinite',
      },
      boxShadow: {
        card: '0 1px 2px rgba(13,27,42,0.08), 0 1px 3px rgba(13,27,42,0.06)',
        float: '0 8px 28px rgba(13,27,42,0.18)',
      },
      zIndex: {
        sheet: '60',
        toast: '70',
        nav: '40',
        header: '30',
      },
    },
  },
  plugins: [],
} satisfies Config;
