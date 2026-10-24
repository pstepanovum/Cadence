import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Electron packaging: produces .next/standalone/server.js
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": ["content/modules.sql", "content/articulation/*.json"],
  },
  turbopack: {
    root: path.join(__dirname),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.brandfetch.io",
      },
    ],
  },
};

export default nextConfig;
