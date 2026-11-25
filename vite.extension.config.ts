import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

function copyExtensionAssetsPlugin(): Plugin {
  return {
    name: 'copy-extension-assets',
    closeBundle() {
      const root = process.cwd();
      const outDir = resolve(root, 'dist-extension');
      mkdirSync(outDir, { recursive: true });
      cpSync(resolve(root, 'extension/manifest.json'), resolve(outDir, 'manifest.json'));
      cpSync(resolve(root, 'extension/background.js'), resolve(outDir, 'background.js'));
      const iconsDir = resolve(root, 'extension/icons');
      if (existsSync(iconsDir)) {
        cpSync(iconsDir, resolve(outDir, 'icons'), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), copyExtensionAssetsPlugin()],
  build: {
    outDir: 'dist-extension',
    emptyOutDir: true,
  },
});
