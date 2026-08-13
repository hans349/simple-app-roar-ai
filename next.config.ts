import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `standalone` emits a self-contained server at .next/standalone/server.js.
  // Harmless if the platform runs `next start`; necessary if it runs a bare
  // container without node_modules. Keeping it on covers both.
  output: "standalone",
};

export default nextConfig;
