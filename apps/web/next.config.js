/** @type {import('next').NextConfig} */
const internalApi = process.env.INTERNAL_API_URL || 'http://api:4000';

const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${internalApi}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
