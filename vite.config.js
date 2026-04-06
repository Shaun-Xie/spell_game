import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// Change this if the GitHub Pages project/repository path changes later.
const githubPagesBase = '/spell_game/';

export default defineConfig({
  base: githubPagesBase,
  plugins: [tailwindcss()],
});
