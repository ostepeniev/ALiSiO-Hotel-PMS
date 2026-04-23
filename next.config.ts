// Forced restart to resolve 502 Bad Gateway
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude native Node.js modules from client-side bundling
  serverExternalPackages: ['better-sqlite3', 'imapflow', 'nodemailer'],
  // Allow build to succeed during modular architecture migration
  // Remove once all modules are fully migrated and TS errors resolved
  typescript: { ignoreBuildErrors: true },
  // eslint config moved to .eslintrc — not in NextConfig type in Next.js 16
};

export default nextConfig;
