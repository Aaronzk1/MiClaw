import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron'
import { resolve } from 'path'

// Strip crossorigin attributes from script/link tags for Electron file:// compatibility
function stripCrossorigin() {
  return {
    name: 'strip-crossorigin',
    enforce: 'post' as const,
    transformIndexHtml(html: string) {
      return html.replace(/\s+crossorigin(?=\s|>|\/)/g, '')
    }
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron([{
      entry: 'electron/main.ts',
      onstart(args) {
        if (process.argv.includes('--dev')) args.startup()
      },
      vite: { build: { outDir: 'dist-electron', rollupOptions: { external: ['electron', 'better-sqlite3'] } } }
    }, {
      entry: 'electron/preload.ts',
      onstart(args) { if (process.argv.includes('--dev')) args.reload() },
      vite: { build: { outDir: 'dist-electron', rollupOptions: { external: ['electron'] } } }
    }]),
    stripCrossorigin()
  ],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'markdown': ['react-markdown', 'remark-gfm', 'remark-math', 'rehype-katex', 'rehype-highlight', 'highlight.js'],
          'katex': ['katex'],
        }
      }
    }
  }
})
