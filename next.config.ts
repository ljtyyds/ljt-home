import type { NextConfig } from "next";
process.env.NEXT_TELEMETRY_DISABLED = "1";
const config: NextConfig = {
  poweredByHeader: false,
  outputFileTracingExcludes: {"/*": ["./data/**/*", "./backups/**/*", "./work/**/*", "./.env*"]},
  serverExternalPackages: ["ipaddr.js"],
  async headers() {
    return [{source: "/:path*", headers: [
      {key:"X-Content-Type-Options",value:"nosniff"},
      {key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},
      {key:"X-Frame-Options",value:"DENY"},
      {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"},
      {key:"Content-Security-Policy",value:"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"},
    ]}];
  },
};
export default config;
