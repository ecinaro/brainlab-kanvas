import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const SERVER_PORT = Number(process.env.SERVER_PORT ?? 8787);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Vite yalnızca apps/web içindeki .env'leri okur; key'in bulunduğu kök .env pakete girmez.
  // Ayrıca hiçbir yerde VITE_ önekli key değişkeni tanımlanmaz.
  server: {
    host: '127.0.0.1',
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: {
      '/api': { target: `http://127.0.0.1:${SERVER_PORT}`, changeOrigin: false },
      '/media': { target: `http://127.0.0.1:${SERVER_PORT}`, changeOrigin: false },
      '/uploads': { target: `http://127.0.0.1:${SERVER_PORT}`, changeOrigin: false },
    },
  },
});
