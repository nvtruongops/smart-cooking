import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone', // For containerized deployment
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default nextConfig;
