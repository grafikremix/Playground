import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { specimens } from './src/experiments.js'

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/Playground/' : '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        ...Object.fromEntries(
          specimens.map((s) => [s.slug, resolve(__dirname, `specimens/${s.slug}.html`)]),
        ),
      },
    },
  },
})
