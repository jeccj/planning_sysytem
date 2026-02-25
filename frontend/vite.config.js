import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [vue()],
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (!id.includes('node_modules')) return
                    if (
                        id.includes('element-plus') ||
                        id.includes('@element-plus/icons-vue')
                    ) {
                        return 'vendor-element'
                    }
                    if (
                        id.includes('/vue/') ||
                        id.includes('vue-router') ||
                        id.includes('pinia')
                    ) {
                        return 'vendor-vue'
                    }
                    return 'vendor-misc'
                }
            }
        }
    },
    server: {
        host: '0.0.0.0',
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:8001',
                changeOrigin: true
            },
            '/uploads': {
                target: 'http://127.0.0.1:8001',
                changeOrigin: true
            }
        }
    }
})
