import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['hnswlib-node', 'ollama', 'better-sqlite3', 'sqlite-vec', 'bindings'],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
