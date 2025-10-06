import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: 'export', // Static export doesn't work well with client-side dynamic routes
  images: {
    unoptimized: true, // Required for Amplify
  },
  trailingSlash: true,
};

// For AWS Amplify WEB_COMPUTE platform
export default require('@aws-amplify/adapter-nextjs/experimental-build').withAmplifyConfig(nextConfig);
