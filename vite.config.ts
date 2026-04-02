import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        worklet: 'src/engine/worklet/GraphProcessor.ts',
      },
      output: {
        entryFileNames: '[name].js',
      }
    }
  }
})
