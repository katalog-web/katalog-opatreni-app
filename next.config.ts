const nextConfig: import('next').NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  // Přidat trailing slash pro Hostinger
  trailingSlash: true,
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },
};

export default nextConfig;
