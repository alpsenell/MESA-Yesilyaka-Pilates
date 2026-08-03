import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the built assets resolve correctly whether the app is served
// from a domain root or a project subpath (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [react()],
})
