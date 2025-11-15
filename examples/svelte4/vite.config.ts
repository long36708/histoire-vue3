/// <reference types="longmo-histoire" />

import { svelte } from '@sveltejs/vite-plugin-svelte'
import { HstSvelte } from 'histoire-plugin-svelte'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    svelte(),
  ],
  histoire: {
    plugins: [
      HstSvelte(),
    ],
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
