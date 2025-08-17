import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// Cesium plugin disabled (Cesium removed)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
