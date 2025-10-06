import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: 'export', // Static export doesn't work well with client-side dynamic routes
  images: {
    unoptimized: true, // Required for Amplify
  },
  trailingSlash: true,
};

export default nextConfig;
