# ts-css-modules-lint

[![CI](https://github.com/brendankemp/ts-css-modules-lint/actions/workflows/ci.yml/badge.svg)](https://github.com/brendankemp/ts-css-modules-lint/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![npm](https://img.shields.io/npm/v/ts-css-modules-lint)](https://www.npmjs.com/package/ts-css-modules-lint)

TypeScript language service plugin for CSS Modules: cross-file unused class detection, autocomplete, and go-to-definition.

## Features

- Editor diagnostics for undefined and unused CSS module classes
- Autocomplete for class names
- Go-to-definition from `styles.className` to the SCSS/CSS/Less source
- CLI for CI linting and auto-fixing
- `.d.ts` generation for build-time type checking of CSS module class names
- Vite plugin for automatic `.d.ts` generation during dev and build
- Supports `.module.scss`, `.module.css`, and `.module.less`

## Quick Setup

```sh
npm install -D ts-css-modules-lint
npx css-modules-lint init
```

The `init` command configures:
- TypeScript plugin in `tsconfig.json` / `tsconfig.app.json`
- Vite plugin in `vite.config.ts` (if present)
- `.gitignore` patterns for generated `.d.ts` files

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

This package provides three independent components that can be used together or separately:

- **TypeScript Language Service Plugin** — Real-time editor diagnostics, autocomplete, and go-to-definition for CSS module classes
- **CLI** — CI-friendly linting (`check`), auto-fixing (`check --fix`), and `.d.ts` generation (`generate`)
- **Vite Plugin** — Automatic `.d.ts` generation integrated into Vite's dev server and build pipeline

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
      { "name": "ts-css-modules-lint" }
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
import cssModulesDts from 'ts-css-modules-lint/vite';

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

## License

MIT
