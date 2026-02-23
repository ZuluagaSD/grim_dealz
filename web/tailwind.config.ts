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
        // GW faction palette — used for faction badges
        'space-marines': '#003087',
        'necrons': '#2e7d32',
        'orks': '#558b2f',
        'chaos': '#b71c1c',
        'eldar': '#6a1b9a',
        'tau': '#0277bd',
        'tyranids': '#4e342e',
        'stormcast': '#f57f17',
      },
    },
  },
  plugins: [],
}

export default config
