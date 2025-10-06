import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Amplify WEB_COMPUTE auto-detects Next.js App Router
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default nextConfig;
