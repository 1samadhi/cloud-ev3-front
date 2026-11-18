import { defineConfig } from 'vitest/config'

/* jsdom y no node: los tests del hook de polling montan un componente real
   para verificar la programación de timers, y eso necesita un DOM. */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
    restoreMocks: true,
  },
})
