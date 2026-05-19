import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const devProxyTarget = env.VITE_DEV_API_PROXY_TARGET?.trim()

  return {
    plugins: [react(), tailwindcss()],
    server:
      command === 'serve' && devProxyTarget
        ? {
            proxy: {
              '/api': {
                target: devProxyTarget,
                changeOrigin: true,
              },
            },
          }
        : undefined,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return
            }

            const flowgramMatch = id.match(/node_modules\/@flowgram\.ai\/([^/]+)\//)
            if (flowgramMatch) {
              return `flowgram-${flowgramMatch[1]}`
            }

            if (id.includes('styled-components')) {
              return 'styled-components'
            }

            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) {
              return 'react-vendor'
            }

            if (id.includes('lucide-react')) {
              return 'icon-vendor'
            }
          },
        },
      },
    },
  }
})
