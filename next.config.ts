import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude native Node.js modules from client-side bundling
  serverExternalPackages: ['better-sqlite3', 'imapflow', 'nodemailer'],
};

export default nextConfig;
