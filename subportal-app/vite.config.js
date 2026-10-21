import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Builds into ../subportal/, which Netlify serves as-is (the CRM site has no build step):
//   crm.grayco-cs.com/subportal/  and  portal.grayco-cs.com/  (netlify.toml rewrites that host there).
// After changing anything in src/, run `npm run build` here and commit ../subportal/ too.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../subportal',
    emptyOutDir: true,
    sourcemap: false,
  },
});
