import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import fs from 'fs-extra'
import { globbySync } from 'globby'
import { defineConfig } from 'vite'
import pkg from './package.json'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, 'dist')
const unwantedPrefix = path.join('packages', 'histoire-plugin-svelte', 'src')

export default defineConfig({
  plugins: [
    svelte(),
    {
      name: 'histoire:preserve:import.dynamic',
      enforce: 'pre',
      transform(code) {
        if (code.includes('import(')) {
          return {
            code: code.replace(/import\(/g, 'import__dyn('),
          }
        }
      },
      closeBundle() {
        // 1. Flatten the unwanted directory prefix caused by Rolldown's preserveModulesRoot
        try {
          const files = globbySync(path.join(outDir, '**/*').replace(/\\/g, '/'))
          for (const file of files) {
            const rel = path.relative(outDir, file)
            const normalizedRel = rel.replace(/\\/g, '/')
            if (normalizedRel.startsWith(unwantedPrefix.replace(/\\/g, '/'))) {
              const newRel = normalizedRel.slice(unwantedPrefix.length + 1)
              const newPath = path.join(outDir, newRel)
              fs.mkdirSync(path.dirname(newPath), { recursive: true })
              fs.renameSync(file, newPath)
            }
          }
          // Clean up empty dirs
          const dirs = globbySync(path.join(outDir, '**').replace(/\\/g, '/'), { onlyDirectories: true })
          for (const dir of dirs.sort().reverse()) {
            try {
              if (fs.readdirSync(dir).length === 0) {
                fs.rmdirSync(dir)
              }
            }
            catch {}
          }
        }
        catch (e) {
          console.error(e)
        }

        // 2. Restore dynamic imports
        try {
          const files = globbySync('./dist/**/*.js')
          for (const file of files) {
            const content = fs.readFileSync(file, 'utf-8')
            if (content.includes('import__dyn')) {
              fs.writeFileSync(file, content.replace(/import__dyn\(/g, 'import(/* @vite-ignore */'), 'utf-8')
            }
          }
        }
        catch (e) {
          console.error(e)
        }
      },
    },
  ],
  build: {
    emptyOutDir: false,
    outDir: 'dist',
    cssCodeSplit: false,
    rolldownOptions: {
      external: [
        ...Object.keys(pkg.dependencies).map(dep => new RegExp(`^${dep}(\\/?)`)),
        ...Object.keys(pkg.peerDependencies).map(dep => new RegExp(`^${dep}(\\/?)`)),
        /^node:/,
        /^virtual:/,
        /^\$/, // Virtual modules
      ],

      input: [
        'src/client/index.ts',
        'src/collect/index.ts',
      ],

      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
        // hoistTransitiveImports: false,
        preserveModules: true,
        preserveModulesRoot: 'src',
      },
      treeshake: false,
      preserveEntrySignatures: 'strict',
    },
  },
})
