/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  transpilePackages: ["@vpp/processing"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb"
    }
  }
};

module.exports = nextConfig;
