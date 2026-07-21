// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// Посадочные встраиваются в готовый Битрикс-сайт под /promo/*.
// base управляет префиксом всех ссылок/ассетов, чтобы страница жила по modengy.ru/promo/...
export default defineConfig({
  site: 'https://modengy.ru',
  base: '/promo',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
