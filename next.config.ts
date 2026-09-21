import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone with a self-contained server.js, so the runtime
  // image carries only the traced dependencies instead of all of node_modules.
  output: "standalone",
};

export default nextConfig;
