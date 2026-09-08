import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLtoPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, { webpack }) => {
    if (config.optimization) {
      config.optimization.splitChunks = {
        chunks: "all",
        minSize: 20000,
        cacheGroups: {
          vendors: {
            test: /[\\/] node_modules[\\/]/,
            priority: -10,
            reuseExistingChunk: true,
          },
        },
      };
    }
    return config;
  },
};

export default nextConfig;