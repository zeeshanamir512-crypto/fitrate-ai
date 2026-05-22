import type { NextConfig } from "next";

/** `turbopack` satisfies Next 16 when a `webpack` hook exists; webpack block applies to `next dev --webpack` only. */
const nextConfig: NextConfig = {
  // Allow iPhone / other devices on your LAN to load dev JS (fixes blank page on mobile)
  allowedDevOrigins: ["192.168.0.150", "192.168.125.1"],
  turbopack: {},
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        aggregateTimeout: 500,
        ignored: ["**/node_modules/**", "**/.git/**"]
      };
    }
    return config;
  }
};

export default nextConfig;
