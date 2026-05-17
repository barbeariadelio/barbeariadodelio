import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const packagesUiPath = path.resolve(__dirname, '../../packages/ui/src');

export default defineConfig({
  base: '/franchise-app/',
  plugins: [react()],
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
      },
    },
  },
  server: {
    port: 5174,
    hmr: { host: 'localhost', port: 5174 },
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
    exclude: ['@barber/ui'],
  },
});
