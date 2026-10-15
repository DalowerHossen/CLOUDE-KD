// path: next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  serverExternalPackages: [
    'sharp',
    'jsdom',
    'isomorphic-dompurify',
    'nodemailer',
    '@react-pdf/renderer',
    '@googleapis/drive',
    'pdf-lib',
  ],
};

module.exports = nextConfig;
