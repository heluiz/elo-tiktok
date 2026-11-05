import preact from '@preact/preset-vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  imports: false,
  vite: () => ({ plugins: [preact()] }),
  webExt: { disabled: true },
  manifest: {
    name: 'elo TikTok',
    description: 'Analise seguidores, seguindo e histórico da sua conta TikTok. Dados locais e código aberto.',
    permissions: ['unlimitedStorage', 'scripting'],
    host_permissions: ['https://www.tiktok.com/*'],
    action: { default_title: 'Abrir elo TikTok' },
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    minimum_chrome_version: '120',
  },
  hooks: {
    'build:publicAssets': (wxt, files) => {
      files.push({ absoluteSrc: `${wxt.config.root}/LICENSE`, relativeDest: 'LICENSE' });
    },
  },
});
