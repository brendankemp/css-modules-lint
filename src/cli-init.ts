import fs from 'fs';
import path from 'path';

const PLUGIN_NAME = 'ts-css-modules-lint';
const VITE_PLUGIN_IMPORT = 'ts-css-modules-lint/vite';

const GITIGNORE_ENTRIES = [
  '*.module.scss.d.ts',
  '*.module.css.d.ts',
  '*.module.less.d.ts',
];

function ensureGitignore(dir: string): void {
  const gitignorePath = path.join(dir, '.gitignore');
  const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';

  const missing = GITIGNORE_ENTRIES.filter(entry => !existing.includes(entry));
  if (missing.length === 0) {
    console.log('.gitignore already configured.');
    return;
  }

  const section = '\n# Generated CSS module type declarations\n' + missing.join('\n') + '\n';
  fs.appendFileSync(gitignorePath, section);
  console.log('Updated .gitignore with CSS module .d.ts patterns.');
}

function ensureTsPlugin(dir: string): void {
  const candidates = ['tsconfig.json', 'tsconfig.app.json'];
  const pluginEntry = `{ "name": "${PLUGIN_NAME}" }`;

  for (const name of candidates) {
    const tsconfigPath = path.join(dir, name);
    if (!fs.existsSync(tsconfigPath)) continue;

    const raw = fs.readFileSync(tsconfigPath, 'utf-8');

    // Strip comments for parsing, but preserve original text for editing
    const stripped = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    let config: any;
    try {
      config = JSON.parse(stripped);
    } catch {
      console.error(`Warning: could not parse ${name}, skipping.`);
      continue;
    }

    const hasPlugin = config.compilerOptions?.plugins?.some(
      (p: any) => p.name === PLUGIN_NAME
    );

    if (hasPlugin) {
      console.log(`${name} already has the plugin configured.`);
      continue;
    }

    // Use targeted text insertion to preserve comments and formatting
    let updated: string;

    if (config.compilerOptions?.plugins) {
      // "plugins" array exists — insert into it
      const pluginsMatch = raw.match(/"plugins"\s*:\s*\[/);
      if (pluginsMatch && pluginsMatch.index != null) {
        const insertPos = pluginsMatch.index + pluginsMatch[0].length;
        const existing = config.compilerOptions.plugins.length > 0;
        const insertion = existing ? ` ${pluginEntry},` : ` ${pluginEntry} `;
        updated = raw.slice(0, insertPos) + insertion + raw.slice(insertPos);
      } else {
        // Fallback: re-serialize (should rarely happen)
        config.compilerOptions.plugins.push({ name: PLUGIN_NAME });
        updated = JSON.stringify(config, null, 2) + '\n';
      }
    } else if (config.compilerOptions) {
      // "compilerOptions" exists but no "plugins" — insert "plugins" key
      const coMatch = raw.match(/"compilerOptions"\s*:\s*\{/);
      if (coMatch && coMatch.index != null) {
        const insertPos = coMatch.index + coMatch[0].length;
        const hasExistingKeys = Object.keys(config.compilerOptions).length > 0;
        const insertion = hasExistingKeys
          ? `\n    "plugins": [${pluginEntry}],`
          : `\n    "plugins": [${pluginEntry}]\n  `;
        updated = raw.slice(0, insertPos) + insertion + raw.slice(insertPos);
      } else {
        config.compilerOptions.plugins = [{ name: PLUGIN_NAME }];
        updated = JSON.stringify(config, null, 2) + '\n';
      }
    } else {
      // No compilerOptions at all — insert after opening brace
      const openBrace = raw.indexOf('{');
      const hasExistingKeys = Object.keys(config).length > 0;
      const insertion = hasExistingKeys
        ? `\n  "compilerOptions": {\n    "plugins": [${pluginEntry}]\n  },`
        : `\n  "compilerOptions": {\n    "plugins": [${pluginEntry}]\n  }\n`;
      updated = raw.slice(0, openBrace + 1) + insertion + raw.slice(openBrace + 1);
    }

    fs.writeFileSync(tsconfigPath, updated);
    console.log(`Added plugin to ${name}.`);
  }
}

async function ensureVitePlugin(dir: string): Promise<void> {
  const candidates = ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs', 'vite.config.cts', 'vite.config.cjs'];
  let viteConfigPath: string | null = null;

  for (const name of candidates) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) {
      viteConfigPath = candidate;
      break;
    }
  }

  if (!viteConfigPath) {
    console.log('No vite config found, skipping Vite plugin setup.');
    return;
  }

  const content = fs.readFileSync(viteConfigPath, 'utf-8');
  const configName = path.basename(viteConfigPath);

  if (content.includes(VITE_PLUGIN_IMPORT)) {
    console.log(`${configName} already has the Vite plugin configured.`);
    return;
  }

  const { loadFile, writeFile } = await import('magicast');
  // @ts-ignore - subpath export requires moduleResolution node16+, but we need "node" for TS plugin compat
  const { addVitePlugin } = await import('magicast/helpers');

  const mod = await loadFile(viteConfigPath);
  addVitePlugin(mod, {
    from: VITE_PLUGIN_IMPORT,
    imported: 'default',
    constructor: 'cssModulesDts',
  });
  await writeFile(mod, viteConfigPath);

  console.log(`Added Vite plugin to ${configName}.`);
}

export async function init(): Promise<void> {
  const dir = process.cwd();

  console.log('Setting up css-modules-lint...\n');

  ensureTsPlugin(dir);
  await ensureVitePlugin(dir);
  ensureGitignore(dir);

  console.log('\nDone! Next steps:');
  console.log('  1. Restart your editor\'s language server');
  console.log('  2. Add to your CI/lint scripts:');
  console.log('     "lint:css": "css-modules-lint check"');
}
