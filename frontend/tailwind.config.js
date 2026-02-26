/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        slatebase: '#111928',
        card: '#1A2233',
        borderline: '#2D3748',
        accent: '#3C50E0'
      }
    }
  },
  plugins: []
};
