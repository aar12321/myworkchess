export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { display: ['Cinzel', 'Georgia', 'serif'], body: ['"Crimson Pro"', 'Georgia', 'serif'] },
      colors: {
        gold: { 300: '#f6d77a', 400: '#f0c24b', 500: '#d9a520', 600: '#a87a12' },
        parch: { 100: '#f3e6c4', 200: '#e3d0a0', 300: '#c9b27a' },
        bark: { 700: '#3a2616', 800: '#2a1a0f', 900: '#190f08' },
      },
    },
  },
  plugins: [],
}
