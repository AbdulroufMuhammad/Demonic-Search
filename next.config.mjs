/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Headless Chromium for the design agent's visual check: keep it out of the bundle and ship its binary with the route.
    serverComponentsExternalPackages: ["playwright-core", "@sparticuz/chromium"],
    outputFileTracingIncludes: {
      "/api/projects/[id]/turn": ["./node_modules/@sparticuz/chromium/bin/**"],
    },
  },
};

export default nextConfig;
