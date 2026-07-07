import type { NextConfig } from "next";

/** `turbopack` satisfies Next 16 when a `webpack` hook exists; webpack block applies to `next dev --webpack` only. */
const nextConfig: NextConfig = {
  // Allow iPhone / other devices on your LAN to load dev JS (fixes blank page on mobile)
  allowedDevOrigins: ["192.168.0.150", "192.168.125.1"],
  async redirects() {
    return [
      // /battle/new (paste-two-URLs flow) was replaced by one-link open battles
      // in July 2026; old links shared in chats land on the homepage.
      { source: "/battle/new", destination: "/", permanent: true }
    ];
  },
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
