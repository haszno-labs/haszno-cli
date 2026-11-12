import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The client falls back to ~/.config/haszno/config.json; point "home" somewhere empty so the
    // suite never reads the developer's real credentials.
    env: { HOME: '/nonexistent-haszno-test-home', USERPROFILE: '/nonexistent-haszno-test-home' },
  },
})
