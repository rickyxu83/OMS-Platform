import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [
    react(),
    tailwindcss(),
    // 测试服在浏览器 tab 标题加标记（部署时注入 VITE_APP_ENVIRONMENT=test）
    {
      name: 'html-title-env',
      transformIndexHtml(html) {
        const isTest = String(process.env.VITE_APP_ENVIRONMENT || '').toLowerCase() === 'test'
        if (isTest) return html.replace('<title>OMS Platform 运维智管</title>', '<title>OMS Platform 运维智管（测试服）</title>')
        return html
      },
    },
  ],
  build: {
    // Known async vendor payloads are large but intentionally isolated and cached.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
            return 'vendor-react'
          }
          if (id.includes('node_modules/opencc-js')) return 'vendor-opencc'
          if (id.includes('node_modules/exceljs')) return 'vendor-excel'
          if (id.includes('node_modules/qrcode')) return 'vendor-qrcode'
          return undefined
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
