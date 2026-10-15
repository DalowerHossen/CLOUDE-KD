// path: next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  eslint: {
    dirs: ['app', 'components', 'lib', 'services', 'config', 'types', 'schemas', 'stores', 'cron', 'workers'],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: [
      'sharp',
      'jsdom',
      'isomorphic-dompurify',
      'nodemailer',
      '@react-pdf/renderer',
      '@googleapis/drive',
      'pdf-lib',
    ],
  },
};

module.exports = nextConfig;
