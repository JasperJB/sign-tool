import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // This suppresses a warning about the 'canvas' dependency
    // which is not needed in the browser environment.
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;