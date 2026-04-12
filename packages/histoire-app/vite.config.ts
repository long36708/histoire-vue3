import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import fs from 'fs-extra'
import { globbySync } from 'globby'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const bundledDir = path.resolve(__dirname, 'dist/bundled')
const unwantedPrefix = path.join('packages', 'histoire-app', 'src')
const pkg = createRequire(import.meta.url)('./package.json')

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'histoire:preserve:import.meta',
      enforce: 'pre',
      transform(code) {
        if (code.includes('import.meta')) {
          return {
            code: code.replace(/import\.meta/g, 'import__meta'),
          }
        }
      },
      closeBundle() {
        // 1. Flatten the unwanted directory prefix caused by Rolldown's preserveModulesRoot
        try {
          const files = globbySync(path.join(bundledDir, '**/*').replace(/\\/g, '/'))
          for (const file of files) {
            const rel = path.relative(bundledDir, file)
            const normalizedRel = rel.replace(/\\/g, '/')
            if (normalizedRel.startsWith(unwantedPrefix.replace(/\\/g, '/'))) {
              const newRel = normalizedRel.slice(unwantedPrefix.length + 1)
              const newPath = path.join(bundledDir, newRel)
              fs.mkdirSync(path.dirname(newPath), { recursive: true })
              fs.renameSync(file, newPath)
            }
          }
          // Clean up empty dirs
          const dirs = globbySync(path.join(bundledDir, '**').replace(/\\/g, '/'), { onlyDirectories: true })
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

        // 2. Restore import.meta
        try {
          const files = globbySync('./dist/bundled/**/*.js')
          for (const file of files) {
            const content = fs.readFileSync(file, 'utf-8')
            if (content.includes('import__meta')) {
              fs.writeFileSync(file, content.replace(/import__meta/g, 'import.meta'), 'utf-8')
            }
          }
        }
        catch (e) {
          console.error(e)
        }
      },
    },
  ],

  resolve: {
    alias: {
      'floating-vue': 'histoire-vendors/floating-vue',
      '@iconify/vue': 'histoire-vendors/iconify',
      'pinia': 'histoire-vendors/pinia',
      'scroll-into-view-if-needed': 'histoire-vendors/scroll',
      'vue-router': 'histoire-vendors/vue-router',
      '@vueuse/core': 'histoire-vendors/vue-use',
      'vue': 'histoire-vendors/vue',
    },
  },

  build: {
    emptyOutDir: false,
    outDir: 'dist/bundled',
    lib: {
      entry: '',
      formats: ['es'],
    },
    rolldownOptions: {
      external: [
        /\$histoire/,
        /^histoire-/,
        ...Object.keys(pkg.dependencies),
      ],

      input: [
        'src/app/api.ts',
        'src/app/index.ts',
        'src/app/sandbox.ts',
      ],

      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
        // hoistTransitiveImports: false,
        // preserveModules: true,
        // preserveModulesRoot: 'src/app',
      },
      treeshake: false,
      preserveEntrySignatures: 'strict',
    },
    cssCodeSplit: false,
    minify: false,
  },
})
