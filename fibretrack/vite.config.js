import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@zxing') || id.includes('node_modules/html5-qrcode')) {
            return 'vendor-zxing';
          }
          if (id.includes('node_modules/tesseract.js')) {
            return 'vendor-tesseract';
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})

