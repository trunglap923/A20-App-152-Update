import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  typescript: {
    // Bypass toàn bộ lỗi TypeScript khi build
    ignoreBuildErrors: true,
  },
  // Disable React Strict Mode to prevent double-mount issues with G6 graph library
  reactStrictMode: false,
  output: 'standalone',
}

export default nextConfig
