/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: 'https://seo-flow-ai-jj6c.onrender.com/api/v1/:path*',
      },
    ]
  },
}

module.exports = nextConfig
