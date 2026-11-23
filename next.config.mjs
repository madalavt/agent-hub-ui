/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // Pages now live under /orgs/{tenant}/projects/{project}/... (like v1); older links go home.
  async redirects() {
    return [
      { source: "/work-items", destination: "/", permanent: false },
      { source: "/work-items/:path*", destination: "/", permanent: false },
      { source: "/trees", destination: "/", permanent: false },
    ];
  },
};
export default nextConfig;
