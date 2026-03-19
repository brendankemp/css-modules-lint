# css-modules-lint

[![CI](https://github.com/brendankemp/css-modules-lint/actions/workflows/ci.yml/badge.svg)](https://github.com/brendankemp/css-modules-lint/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![npm](https://img.shields.io/npm/v/css-modules-lint)](https://www.npmjs.com/package/css-modules-lint)

Lint, autocomplete, and generate types for CSS Modules. Includes a TypeScript language service plugin (diagnostics, go-to-definition, completions), a CLI for CI linting and auto-fixing, and a Vite plugin for `.d.ts` generation.

## Features

- Editor diagnostics for undefined and unused CSS module classes
- Autocomplete for class names
- Go-to-definition from `styles.className` to the SCSS/CSS/Less source
- CLI for CI linting and auto-fixing
- `.d.ts` generation for build-time type checking of CSS module class names
- Vite plugin for automatic `.d.ts` generation during dev and build
- ESLint plugin with `undefined-class` and `unused-class` rules
- Supports `.module.scss`, `.module.css`, and `.module.less`

## Requirements

- TypeScript >= 5.0.0
- ESLint >= 9.0.0 (optional, for ESLint plugin)
- Vite >= 4.0.0 (optional, for Vite plugin)
- Node.js >= 20

## Quick Setup

```sh
npm install -D css-modules-lint
npx css-modules-lint init
```

The `init` command configures:
- TypeScript plugin in `tsconfig.json` / `tsconfig.app.json`
- Vite plugin in `vite.config.{ts,js,mts,mjs,cts,cjs}` (if present)
- `.gitignore` patterns for generated `.d.ts` files

To enable eslint rules, add to your `eslint.config.js`:

```js
import cssModulesLint from "css-modules-lint/eslint";

export default [...cssModulesLint.configs.recommended];
```

## Manual Setup

If you prefer to configure manually instead of using `npx css-modules-lint init`:

### 1. Install

```sh
npm install -D css-modules-lint
```

### 2. TypeScript plugin

Add to `tsconfig.json` (or `tsconfig.app.json`):

```json
{
  "compilerOptions": {
    "plugins": [
      { "name": "css-modules-lint" }
    ]
  }
}
```

Then restart your editor's TypeScript language server.

### 3. Vite plugin (optional)

```ts
// vite.config.ts
import cssModulesDts from "css-modules-lint/vite";

export default defineConfig({
  plugins: [cssModulesDts()],
});
```

### 4. ESLint plugin (optional)

```js
// eslint.config.js
import cssModulesLint from "css-modules-lint/eslint";

export default [...cssModulesLint.configs.recommended];
```

### 5. `.gitignore`

Add generated `.d.ts` files to `.gitignore`:

```
*.module.scss.d.ts
*.module.css.d.ts
*.module.less.d.ts
```

### 6. CI lint script (optional)

Add to `package.json`:

```json
{
  "scripts": {
    "lint:css": "css-modules-lint check"
  }
}
```

## CLI

```sh
# Check for undefined/unused CSS module classes
npx css-modules-lint check

# Check with a specific tsconfig
npx css-modules-lint check --project tsconfig.app.json

# Auto-fix: remove unused classes from stylesheets
npx css-modules-lint check --fix

# Generate .d.ts files for all CSS modules
npx css-modules-lint generate

# Watch mode
npx css-modules-lint generate --watch
```

## Components

This package provides four independent components that can be used together or separately:

- **TypeScript Language Service Plugin** — Real-time editor diagnostics, autocomplete, and go-to-definition for CSS module classes
- **CLI** — CI-friendly linting (`check`), auto-fixing (`check --fix`), and `.d.ts` generation (`generate`)
- **Vite Plugin** — Automatic `.d.ts` generation integrated into Vite's dev server and build pipeline
- **ESLint Plugin** — `undefined-class` and `unused-class` rules for flat config (ESLint >= 9)

> **Note on overlap:** If you use `.d.ts` generation (via the Vite plugin or `generate` CLI), TypeScript already reports undefined class references as type errors. In that case the ESLint `undefined-class` rule and the CLI's undefined-class check are redundant — their main added value is **unused class detection**, which `.d.ts` generation does not provide. The TS language service plugin, by contrast, works without `.d.ts` files and provides diagnostics, autocomplete, and go-to-definition directly in your editor.

### TypeScript Language Service Plugin

Runs inside your editor's TypeScript server. Provides real-time feedback as you code — no build step or `.d.ts` files required.

- **Diagnostics**: Errors for undefined class references (`styles.nonExistent`) and warnings for unused classes defined in stylesheets
- **Autocomplete**: Suggests available class names when typing `styles.`
- **Go-to-definition**: Click through from `styles.className` to the exact line in the SCSS/CSS/Less source

Add to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "plugins": [
      { "name": "css-modules-lint" }
    ]
  }
}
```

Then restart your editor's TypeScript language server.

### CLI

Command-line tool for CI pipelines and local checks.

- **`init`** — One-time project setup. Configures the TS plugin, Vite plugin, and `.gitignore` entries.
- **`check`** — Scans your project for undefined and unused CSS module classes. Exits with code 1 if issues are found.
- **`check --fix`** — Automatically removes unused class rules from stylesheets. Handles multi-selector rules (removes only the unused selector) and nested SCSS rules (`&-suffix`).
- **`generate`** — Produces `.d.ts` files for all CSS modules, enabling build-time type checking of class names.
- **`generate --watch`** — Watches for stylesheet changes and regenerates `.d.ts` files incrementally.

### Vite Plugin

Integrates `.d.ts` generation into Vite's dev server and build pipeline, so you get typed CSS module imports without running a separate process.

#### Setup

```ts
// vite.config.ts
import cssModulesDts from 'css-modules-lint/vite';

export default defineConfig({
  plugins: [cssModulesDts(), react()],
});
```

#### Options

```ts
cssModulesDts({
  verbose: true, // Enable logging (default: false)
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `verbose` | `boolean` | `false` | Log `.d.ts` generation and update events |

#### Behavior

- **Dev mode** (`vite dev`): Generates all `.d.ts` files in the background (non-blocking) at startup. Updates individual files on hot module replacement. Cleans up `.d.ts` files when source files are deleted.
- **Build mode** (`vite build`): Hooks into Vite's `css.modules.getJSON` callback to generate `.d.ts` files directly from Vite's CSS processing — no duplicate parsing.

#### Performance

Benchmarked against a 305-module project:

| Scenario | Impact |
|----------|--------|
| Dev server startup | None (runs in background via `setImmediate`) |
| Cold build | ~18ms (writes `.d.ts` files from Vite's CSS processing, no extra parsing) |
| Warm build (no changes) | ~3ms (diff check, no writes) |

### ESLint Plugin

Provides two rules for CSS module class usage, compatible with ESLint flat config (>= 9.0.0).

#### Setup

```js
// eslint.config.js
import cssModulesLint from "css-modules-lint/eslint";

export default [...cssModulesLint.configs.recommended];
```

#### Rules

| Rule | Severity | Description |
|------|----------|-------------|
| `css-modules-lint/undefined-class` | error | Disallow using CSS class names not defined in the imported style file |
| `css-modules-lint/unused-class` | warn | Warn when CSS classes defined in a style file are not used by any importer |

## License

MIT
