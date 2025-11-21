import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    define: {
      // Hace accesible la variable de entorno API_KEY al código del cliente de forma segura durante el build
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    }
  };
});