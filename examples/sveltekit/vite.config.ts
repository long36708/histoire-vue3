/// <reference types="longmo-histoire" />

import { sveltekit } from '@sveltejs/kit/vite'
import { HstSvelte } from 'histoire-plugin-svelte'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    sveltekit(),
  ],
  histoire: {
    plugins: [
      HstSvelte(),
    ],
    setupFile: './src/histoire.setup.ts',
    tree: {
      groups: [
        {
          id: 'top',
          title: '',
        },
      ],
    },
  },
})
