import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const packagesUiPath = path.resolve(__dirname, '../../packages/ui/src');

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
      },
    },
  },
  server: {
    port: 5173,
    hmr: { host: 'localhost', port: 5173 },
    watch: {
      ignored: (filePath: string) => {
        if (filePath.includes('packages\\ui\\src') || filePath.includes('packages/ui/src')) return false;
        return filePath.includes('node_modules');
      },
    },
  },
  resolve: {
    alias: {
      '@barber/ui': path.resolve(packagesUiPath, 'index.ts'),
    },
  },
  optimizeDeps: {
    // Impede o Vite de pré-empacotar @barber/ui (garantindo que sempre use o fonte atualizado)
    exclude: ['@barber/ui'],
  },
});
