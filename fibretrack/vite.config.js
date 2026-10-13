import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'fix-html-for-webview',
      transformIndexHtml(html) {
        let modified = html.replace(/ crossorigin/g, '');
        modified = modified.replace(/ type="module"/g, '');
        const scriptMatches = [...modified.matchAll(/<script[^>]*src="[^"]*"[^>]*><\/script>/g)];
        for (const m of scriptMatches) {
          modified = modified.replace(m[0], '');
        }
        const scripts = scriptMatches.map((m) => m[0]).join('\n  ');
        return modified.replace('</body>', `  ${scripts}\n</body>`);
      },
    },
  ],
})
