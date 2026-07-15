import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_PORTFOLIO_ATLAS === '1' ? '/atlas/viboard/' : '/',
  plugins: [react(), tailwindcss()],
})
