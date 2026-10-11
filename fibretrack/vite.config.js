import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'fix-html-for-webview',
      closeBundle() {
        const htmlPath = join(process.cwd(), 'dist', 'index.html')
        let html = readFileSync(htmlPath, 'utf-8')
        html = html.replace(/ crossorigin/g, '')
        html = html.replace(/ type="module"/g, '')
        // Move script tags to end of body (after #root)
        const scriptMatches = [...html.matchAll(/<script[^>]*src="[^"]*"[^>]*><\/script>/g)]
        for (const m of scriptMatches) {
          html = html.replace(m[0], '')
        }
        const scripts = scriptMatches.map(m => m[0]).join('\n  ')
        html = html.replace('</body>', `  ${scripts}\n</body>`)
        writeFileSync(htmlPath, html)
      },
    },
  ],
})
