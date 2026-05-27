/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'bg-app': 'var(--bg-app)',
        'bg-panel': 'var(--bg-panel)',
        'bg-track': 'var(--bg-track)',
        'bg-clip-video': 'var(--bg-clip-video)',
        'bg-clip-audio': 'var(--bg-clip-audio)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        accent: 'var(--accent)',
        playhead: 'var(--playhead)',
        border: 'var(--border)'
      }
    }
  },
  plugins: []
};