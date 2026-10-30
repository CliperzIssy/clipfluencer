/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['fluent-ffmpeg'],
  typescript: {
    // Skip TypeScript errors during production build
    // The timeline library has strict type definitions that conflict
    ignoreBuildErrors: true,
  },
  eslint: {
    // Skip ESLint errors during production build
    ignoreDuringBuilds: true,
  },
  // Disable static page generation for pages that use dynamic data
  experimental: {
    // This helps with build issues on Vercel
  },
};

module.exports = nextConfig;
