/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Space Grotesk', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      colors: {
        surface: {
          base:   '#0f0e0e',  // warm near-black — matte stone
          raised: '#171615',  // warm dark layer
          card:   '#1d1c1b',  // warm card surface
          hover:  '#252320',  // warm hover state
          border: '#2e2b28',  // warm border
          muted:  '#433f3b',  // warm muted accent
        },
        ink: {
          primary:   '#f3f2ef',  // warm off-white
          secondary: '#a09c97',  // warm secondary text
          tertiary:  '#6b6762',  // warm tertiary text
          disabled:  '#4d4a46',  // warm disabled
        },
        amber: {
          DEFAULT: '#f59e0b',
          dim:     '#b45309',
          glow:    '#fbbf24',
        },
      },
      boxShadow: {
        card:        '0 1px 0 rgba(255,255,255,0.05) inset, 0 2px 6px rgba(0,0,0,0.7), 0 1px 2px rgba(0,0,0,0.5)',
        'card-hover':'0 1px 0 rgba(255,255,255,0.08) inset, 0 8px 24px rgba(0,0,0,0.65)',
      },
      dropShadow: {
        glow: '0 0 8px rgba(245,158,11,0.7)',
      },
    },
  },
  plugins: [],
};
