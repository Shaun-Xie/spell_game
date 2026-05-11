import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// Update this if the GitHub Pages project/repository path changes.
const githubPagesBase = '/spell_game/';

export default defineConfig({
  base: githubPagesBase,
  plugins: [tailwindcss()],
});
