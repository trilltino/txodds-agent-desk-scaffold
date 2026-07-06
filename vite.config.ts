import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite is only the internal Tauri webview asset server/bundler. Live TxLINE,
// Triton, Yellowstone, and txoracle validation all go through Rust/sidecars.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] }
  },
  // Only VITE_/TAURI_ prefixed variables may enter frontend code. Secrets in
  // .env intentionally use non-VITE names so they stay Rust-side.
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG
  }
})
