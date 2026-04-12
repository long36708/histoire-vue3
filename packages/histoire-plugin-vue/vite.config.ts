import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { globbySync } from 'globby'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const bundledDir = path.resolve(__dirname, 'dist/bundled')
const unwantedPrefix = path.join('packages', 'histoire-plugin-vue', 'src')

export default defineConfig({
  plugins: [
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
    outDir: 'dist/bundled',
    lib: {
      entry: '',
      formats: ['es'],
    },
    rolldownOptions: {
      external: [
        /\$histoire/,
        /^histoire-/,
        'vue',
        'change-case',
        'globby',
        'launch-editor',
        'pathe',
      ],

      input: [
        'src/client/client.ts',
        'src/client/server.ts',
      ],

      output: {
        // manualChunks (id) {
        //   if (id.includes('node_modules')) {
        //     return 'vendor'
        //   }
        // },
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
