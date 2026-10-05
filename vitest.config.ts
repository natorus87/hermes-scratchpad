import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      // Tests run without the Hermes host; a stub satisfies the import.
      '@hermes/plugin-sdk': fileURLToPath(new URL('./tests/sdk-stub.ts', import.meta.url))
    }
  }
})
