import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron'
import electronRenderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'

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
    electronRenderer()
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
