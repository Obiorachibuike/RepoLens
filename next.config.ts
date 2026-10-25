import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Remote images (GitHub avatars) are rendered with plain <img> elements so the
  // app never depends on the Next.js image optimizer reaching third-party hosts.
  images: { unoptimized: true },
  experimental: {
    // Keeps server-only modules out of the client bundle.
    serverActions: { bodySizeLimit: "1mb" },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
