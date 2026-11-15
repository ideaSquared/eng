import { defineConfig } from 'vitest/config';

// Ink only emits colour when chalk sees a colour terminal; the app colour tests need it on in any environment.
export default defineConfig({ test: { env: { FORCE_COLOR: '1' } } });
