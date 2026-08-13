import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// `catalyst serve` claims 3000, but falls back to the next free port when
// another Catalyst project is already serving (running skycamone and
// skyquote side by side is normal on this machine). Set CATALYST_SERVE_PORT
// to whatever it actually printed.
const BACKEND_PORT = process.env.CATALYST_SERVE_PORT || '3000'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // For local browser testing only — proxies same-origin /api/* requests
    // to the local `catalyst serve` backend so the dev-server browser isn't
    // blocked by CORS (Catalyst's Authorized Domains gateway, which adds
    // CORS headers in production, doesn't run under local serve).
    proxy: {
      '/api': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/server/skyquote_function'),
      },
    },
  },
})
