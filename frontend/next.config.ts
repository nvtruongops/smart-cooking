import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export', // Static HTML export for Amplify WEB platform
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  // Disable dynamic routes pre-rendering (client-side only)
  exportPathMap: async function () {
    return {
      '/': { page: '/' },
    };
  },
};

export default nextConfig;
