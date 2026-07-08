import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Serve a recently-visited route from the client router cache instead of
    // re-fetching it from the server on every navigation. Makes flipping back
    // to a channel feel instant; realtime keeps the content fresh.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
