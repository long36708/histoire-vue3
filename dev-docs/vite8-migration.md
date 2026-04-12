# Vite 8 (Rolldown) 迁移经验总结

## 核心变化

Vite 8 使用 Rolldown 替代了 Rollup 作为构建器，导致以下破坏性变更：

- `build.rollupOptions` → `build.rolldownOptions`（前者已废弃）
- `preserveModulesRoot` 行为变化：Rollup 接受相对路径 `'src'`，Rolldown 解析模块 ID 为绝对路径后匹配，相对路径可能失效
- `preserveModules: true` 会将未标记为 external 的 node_modules 依赖也作为单独模块保留，生成指向 `node_modules/.pnpm/...` 的相对路径

---

## 问题 1：preserveModulesRoot 路径前缀未截断

### 现象

配置 `preserveModules: true` + `preserveModulesRoot: 'src'` 后，构建产物路径为：

```
dist/bundled/packages/histoire-plugin-vue2/src/client/client.js
```

期望路径为：

```
dist/bundled/client/client.js
```

### 原因

Rolldown 内部将模块 ID 解析为绝对路径（如 `f:/learn-front/.../packages/histoire-plugin-vue2/src/client/client.ts`），`preserveModulesRoot: 'src'` 作为相对路径无法正确匹配绝对路径中的 `src` 部分，导致整个路径 `packages/histoire-plugin-vue2/src/` 被保留到输出中。

### 解决方案

在 `closeBundle` 钩子中添加 Vite 插件，构建完成后将多余的目录层级移平：

```ts
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { globbySync } from 'globby'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const bundledDir = path.resolve(__dirname, 'dist/bundled')
const unwantedPrefix = path.join('packages', '<包名>', 'src')

export default defineConfig({
  plugins: [
    {
      name: 'flatten-output-paths',
      closeBundle() {
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
          // 清理空目录
          const dirs = globbySync(path.join(bundledDir, '**').replace(/\\/g, '/'), { onlyDirectories: true })
          for (const dir of dirs.sort().reverse()) {
            try {
              if (fs.readdirSync(dir).length === 0) {
                fs.rmdirSync(dir)
              }
            } catch {}
          }
        } catch (e) {
          console.error(e)
        }
      },
    },
  ],
})
```

### 已修复的包

| 包名 | unwantedPrefix |
|---|---|
| `histoire-plugin-vue2` | `packages/histoire-plugin-vue2/src` |
| `histoire-plugin-vue` | `packages/histoire-plugin-vue/src` |
| `histoire-app` | `packages/histoire-app/src` |
| `histoire-plugin-svelte` | `packages/histoire-plugin-svelte/src` |

---

## 问题 2：preserveModules 导致 node_modules 被保留为单独模块

### 现象

构建产物中出现了指向 `node_modules/.pnpm/...` 的相对路径引用：

```js
import { pascalCase as e } from "../../../../node_modules/.pnpm/pascal-case@3.1.2/node_modules/pascal-case/dist.es2015/index.js";
import { paramCase as t } from "../../../../node_modules/.pnpm/param-case@3.0.4/node_modules/param-case/dist.es2015/index.js";
```

### 原因

`preserveModules: true` 模式下，未标记为 `external` 的依赖会被 Rolldown 作为单独模块保留，生成指向 `node_modules` 的相对路径，这在发布后无法工作。

### 解决方案

1. 将运行时使用的依赖加入 `rolldownOptions.external` 列表
2. 将该依赖从 `devDependencies` 移到 `dependencies`（因为运行时需要）

```ts
rolldownOptions: {
  external: [
    /\$histoire/,
    /^histoire-/,
    'vue',
    'change-case', // 运行时依赖，需标记为 external
  ],
}
```

### 经验法则

使用 `preserveModules: true` 时，**所有非项目源码的 import 都必须标记为 external**，否则 Rolldown 会将它们保留为指向 node_modules 的相对路径引用。这包括：

- 运行时第三方依赖（如 `change-case`、`globby`、`launch-editor`、`pathe` 等）
- workspace 依赖（如 `histoire-shared`、`histoire-controls` 等，通常用 `/^histoire-/` 正则匹配）
- 框架依赖（如 `vue`）
- 虚拟模块（如 `virtual:$histoire-*`，通常用 `/\$histoire/` 正则匹配）

### 已修复的包

| 包名 | external 列表 |
|---|---|
| `histoire-plugin-vue2` | `/\$histoire/`, `/^histoire-/`, `vue`, `change-case` |
| `histoire-plugin-vue` | `/\$histoire/`, `/^histoire-/`, `vue`, `change-case`, `globby`, `launch-editor`, `pathe` |

---

## 问题 3：ESM 模块中 require() 不可用

### 现象

部分包的 `vite.config.ts` 使用了 `require('./package.json').dependencies`，但项目设置了 `"type": "module"`，ESM 中不支持 `require()`。

### 解决方案

使用 `createRequire` 替代：

```ts
import { createRequire } from 'node:module'
const pkg = createRequire(import.meta.url)('./package.json')

// 使用
external: [...Object.keys(pkg.dependencies)]
```

或使用 ESM import assertion（Node.js 22+）：

```ts
import pkg from './package.json' with { type: 'json' }
```

---

## 问题 4：ESM 模块中 __dirname 不可用

### 现象

ESM 模块中没有 `__dirname` 全局变量。

### 解决方案

```ts
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
```

Node.js 22+ 也可直接使用 `import.meta.dirname`。

---

## 迁移 Checklist

针对每个需要从 Vite 7 升级到 Vite 8 的包：

- [ ] `rollupOptions` → `rolldownOptions`
- [ ] 检查 `preserveModules: true` 时，添加 `closeBundle` 扁平化插件
- [ ] 检查所有 import 的依赖是否都标记为 `external`（特别是 `preserveModules` 模式下）
- [ ] 运行时依赖从 `devDependencies` 移到 `dependencies`
- [ ] ESM 兼容：`require()` → `createRequire()`，`__dirname` → `fileURLToPath`
- [ ] 验证构建产物路径与 `package.json` 的 `exports` 字段匹配
