import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* El puerto 5173 no es casual: es el `returnUrl` que ms-pago le entrega a
   Transbank y el origen que los tres microservicios autorizan por CORS
   (CORS_ORIGENES). Cambiarlo obliga a cambiar ambos lados. */
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', sourcemap: false },
})
