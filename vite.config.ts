import vite from 'vite';
import createExternal from 'vite-plugin-external';

// https://vitejs.dev/config/
const config = vite.defineConfig({
  plugins: [
    createExternal({
      nodeBuiltins: true,
    }),
  ],
  build: {
    ssr: true,
    emptyOutDir: false,
    lib: {
      entry: './src/index.ts',
      formats: ['es', 'cjs'],
      fileName: (format: string) => `index.${format === 'es' ? 'mjs' : 'js'}`,
    },
    outDir: 'dist',
    sourcemap: false,
    minify: false,
  },
});

export default config;
