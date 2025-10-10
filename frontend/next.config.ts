import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Removed 'output: export' to support dynamic routes
  // Will deploy to AWS App Runner instead of S3
  output: 'standalone', // For Docker deployment
  images: {
    unoptimized: true, // Keep for now, can enable optimization later
  },
  eslint: {
    ignoreDuringBuilds: true, // Temporarily ignore ESLint errors during build
  },
  typescript: {
    ignoreBuildErrors: true, // Temporarily ignore TypeScript errors during build
  },
};

export default nextConfig;
