import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The GitHub Pages demo (VITE_DEMO=true) is a project site, so it is served from /waxcrate/ and uses
// an in-browser mock instead of the API. Override the subpath with VITE_DEMO_BASE if you fork it.
const demo = process.env.VITE_DEMO === 'true'

export default defineConfig(({ command }) => ({
  base: demo && command === 'build' ? (process.env.VITE_DEMO_BASE ?? '/waxcrate/') : '/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: demo ? undefined : { '/api': 'http://localhost:6170' },
  },
}))
