import { defineConfig, loadEnv } from 'vite'
import type { ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

// Vite exists for frontend iteration and webview asset building. Production
// desktop network paths should still go through Rust commands.

// Both RPC Pool tokens have Allowed Origins locked (__blocked.rpcpool.com), so
// the browser cannot call rpcpool.com directly. The dev server proxies
// /rpc/devnet and /rpc/mainnet to Triton and injects the x-token header
// server-side, which also keeps the tokens out of the client bundle.
function tritonProxy(target: string | undefined, token: string | undefined): ProxyOptions | undefined {
  if (!target) return undefined
  return {
    target,
    changeOrigin: true,
    rewrite: () => '/',
    headers: token ? { 'x-token': token } : undefined
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxy: Record<string, ProxyOptions> = {}
  // Proxy routes are added only when matching endpoint/token pairs are present.
  // This keeps browser dev mode from failing on machines without Triton access.
  const devnet = tritonProxy(env.TRITON_DEVNET_RPC, env.TRITON_DEVNET_TOKEN)
  const mainnet = tritonProxy(env.TRITON_MAINNET_RPC, env.TRITON_MAINNET_TOKEN)
  if (devnet) proxy['/rpc/devnet'] = devnet
  if (mainnet) proxy['/rpc/mainnet'] = mainnet

  return {
    plugins: [react()],
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      watch: { ignored: ['**/src-tauri/**'] },
      proxy
    },
    // Only VITE_/TAURI_ prefixed variables may enter frontend code. Secrets in
    // .env intentionally use non-VITE names so they stay server-side.
    envPrefix: ['VITE_', 'TAURI_'],
    build: {
      target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
      minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
      sourcemap: !!process.env.TAURI_ENV_DEBUG
    }
  }
})
