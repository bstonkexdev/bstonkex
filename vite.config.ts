import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Security headers for preview/production
  preview: {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    },
  },
  server: {
    host: "0.0.0.0",
    strictPort: true,
    // HMR websockets can't traverse the playground's two proxy hops (the
    // upgrade header is stripped), so the client would just log a failed
    // connection and retry forever. Reloads are driven by the playground
    // itself (file-written events); disable HMR to silence the noise.
    hmr: false,
    // Vite 6 blocks hosts not in this allowlist (CSRF protection). The
    // playground serves previews via Fly's proxy at <app>.fly.dev with a
    // routing header, so we allow .fly.dev plus the gitlawb published
    // domain. Localhost stays allowed for local dev runs of the template.
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      ".fly.dev",
      ".gitlawb.app",
    ],
  },
});
