import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages のサブパス配信でも動くよう相対パスでビルドする
  base: "./",
  build: {
    rollupOptions: {
      input: {
        // ルートは言語別パス（/ja/ /en/）への振り分けだけを行うリダイレクタ
        root: resolve(import.meta.dirname, "index.html"),
        ja: resolve(import.meta.dirname, "ja/index.html"),
        en: resolve(import.meta.dirname, "en/index.html"),
      },
    },
  },
});
