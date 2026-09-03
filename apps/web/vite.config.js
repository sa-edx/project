import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    cesium({
      cesiumBaseUrl: 'cesium-lib/',
      cesiumBuildRootPath: path.resolve(__dirname, '../../node_modules/cesium/Build'),
      cesiumBuildPath: path.resolve(__dirname, '../../node_modules/cesium/Build/Cesium/'),
    }),
  ],
  envDir: path.resolve(__dirname, '../..'),
});
