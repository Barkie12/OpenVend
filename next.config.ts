import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    // Product images are uploaded at runtime and served from the data volume;
    // skipping the optimizer keeps the Docker image free of native deps.
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      // File uploads use /api/admin/uploads (server-action multipart parsing is
      // unreliable); this only covers text-heavy actions like big stock pools.
      bodySizeLimit: "5mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // No page in this app is meant to be embedded elsewhere; blocks clickjacking.
          { key: "X-Frame-Options", value: "DENY" },
          // Keeps /order/<token> receipt URLs out of cross-origin Referer headers.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
