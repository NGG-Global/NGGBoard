/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Type + unit tests are the quality gate for this MVP; lint is advisory.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
