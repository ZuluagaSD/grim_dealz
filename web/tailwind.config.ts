import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // GW faction palette — bright enough for dark backgrounds
        'space-marines': '#4a7fd4',
        necrons: '#4ade80',
        orks: '#86efac',
        chaos: '#f87171',
        eldar: '#c084fc',
        tau: '#38bdf8',
        tyranids: '#fb923c',
        stormcast: '#fbbf24',
        // Brand gold
        gold: {
          DEFAULT: '#c9a84c',
          light: '#d4b565',
          dim: '#2a1f00',
        },
        // Text / bone tones
        bone: {
          DEFAULT: '#e8e0d0',
          muted: '#a09880',
          faint: '#5a5248',
        },
        // Dark surface layers
        ink: {
          DEFAULT: '#0c0c0c',
          card: '#141414',
          raised: '#1e1e1e',
          high: '#282828',
          rim: '#2a2a2a',
        },
      },
      fontFamily: {
        cinzel: ['var(--font-cinzel)', 'serif'],
      },
      boxShadow: {
        'gold-glow': '0 0 20px rgba(201, 168, 76, 0.25)',
        'gold-glow-lg': '0 0 40px rgba(201, 168, 76, 0.2)',
      },
    },
  },
  plugins: [],
}

export default config
