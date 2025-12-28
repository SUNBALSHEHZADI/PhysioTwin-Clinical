import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["http://localhost:3000", "http://127.0.0.1:3000", "http://192.168.56.1:3000"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ambiq.com",
        pathname: "/wp-content/uploads/**"
      }
    ]
  }
};

export default nextConfig;


