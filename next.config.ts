import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude better-sqlite3 from client-side bundling
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
