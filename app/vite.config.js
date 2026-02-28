import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { getUrls } from './config/urls.js';

// Get URLs for current environment
const urls = getUrls();

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __APP_ENV__: JSON.stringify(process.env.NODE_ENV || 'development'),
    __BACKEND_URL__: JSON.stringify(process.env.VITE_BACKEND_URL || urls.BACKEND_BASE)
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/v1/ai': {
        target: urls.BACKEND_BASE,
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('Vite proxy error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Vite proxy request:', req.method, req.url);
          });
        }
      },
      '/api/v1/agent': {
        target: urls.BACKEND_BASE,
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('Vite proxy error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Vite proxy request:', req.method, req.url);
          });
        }
      }
    }
  }
});