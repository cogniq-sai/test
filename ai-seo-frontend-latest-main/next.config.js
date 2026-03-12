/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Dynamically pick destination based on environment or manual toggle
    const isProd = process.env.NODE_ENV === 'production' || process.env.USE_PROD_API === 'true';
    const apiUrl = isProd
      ? 'https://autorankr-ai.onrender.com/api/v1/:path*'
      : 'http://127.0.0.1:8000/api/v1/:path*';

    return [
      {
        source: '/api/v1/:path*',
        destination: apiUrl,
      },
    ]
  },
}

module.exports = nextConfig
