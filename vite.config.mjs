import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist', // Output directory
    minify: true, // Enable minification
    sourcemap: false, // No source maps
    rollupOptions: {
      input: 'gif_image_generator.js', // Entry file
      output: {
        dir: 'dist', // Ensure files go to 'dist'
        entryFileNames: '[name].js', // Ensures predictable output name
        assetFileNames: '[name].[ext]', // Keep asset filenames clean
        chunkFileNames: '[name].js', // No hashed chunk names
        format: 'cjs', // CommonJS format (for Node.js)
      },
    },
  },
});
