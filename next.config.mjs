/** @type {import('next').NextConfig} */
export default {
  serverExternalPackages: ['pg'],
  // The source uses ESM-style ".js" import specifiers for ".ts" files; Turbopack does not map them, webpack can.
  // So dev and build run with --webpack (see package.json).
  webpack(config) {
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
};
