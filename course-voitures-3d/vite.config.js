import { defineConfig } from 'vite';

/**
 * Configuration Vite.
 *
 * Le projet est un site statique : pas de backend, pas de variables
 * d'environnement. Les textures sont servies depuis `public/`, donc
 * disponibles à l'adresse `/textures/...`.
 */
export default defineConfig({
  // Base relative : le build fonctionne ouvert depuis n'importe quel
  // sous-chemin (y compris un simple ouverture de fichier via un serveur).
  base: './',

  server: {
    port: 5173,
    open: true,
  },

  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    // Three.js est volumineux : on le découpe en morceaux pour que le
    // navigateur ne télécharge que ce qu'il faut.
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
