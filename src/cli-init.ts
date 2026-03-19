import fs from "fs";
import path from "path";
import { parse, modify, applyEdits } from "jsonc-parser";

const PLUGIN_NAME = "css-modules-lint";
const VITE_PLUGIN_IMPORT = "css-modules-lint/vite";

const GITIGNORE_ENTRIES = [
  "*.module.scss.d.ts",
  "*.module.css.d.ts",
  "*.module.less.d.ts",
];

function ensureGitignore(dir: string): void {
  const gitignorePath = path.join(dir, ".gitignore");
  const existing = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, "utf-8")
    : "";

  const missing = GITIGNORE_ENTRIES.filter(
    (entry) => !existing.includes(entry),
  );
  if (missing.length === 0) {
    console.log(".gitignore already configured.");
    return;
  }

  const section =
    "\n# Generated CSS module type declarations\n" + missing.join("\n") + "\n";
  fs.appendFileSync(gitignorePath, section);
  console.log("Updated .gitignore with CSS module .d.ts patterns.");
}

/** Detect the indent unit (e.g. "  ", "    ", "\t") used in a JSON file. */
function detectIndent(text: string): string {
  const match = text.match(/^(\s+)"/m);
  return match ? match[1] : "  ";
}

function ensureTsPlugin(dir: string): void {
  const hasAppConfig = fs.existsSync(path.join(dir, "tsconfig.app.json"));
  const candidates = hasAppConfig ? ["tsconfig.app.json"] : ["tsconfig.json"];

  for (const name of candidates) {
    const tsconfigPath = path.join(dir, name);
    if (!fs.existsSync(tsconfigPath)) continue;

    const raw = fs.readFileSync(tsconfigPath, "utf-8");
    const config = parse(raw);
    if (!config || typeof config !== "object") {
      console.error(`Warning: could not parse ${name}, skipping.`);
      continue;
    }

    const hasPlugin = config.compilerOptions?.plugins?.some(
      (p: any) => p.name === PLUGIN_NAME,
    );

    if (hasPlugin) {
      console.log(`${name} already has the plugin configured.`);
      continue;
    }

    const indent = detectIndent(raw);
    const tabSize = indent === "\t" ? 1 : indent.length;
    const insertSpaces = indent !== "\t";

    const plugins = config.compilerOptions?.plugins ?? [];
    const edits = modify(
      raw,
      ["compilerOptions", "plugins"],
      [...plugins, { name: PLUGIN_NAME }],
      {
        formattingOptions: { tabSize, insertSpaces },
      },
    );

    const updated = applyEdits(raw, edits);
    fs.writeFileSync(tsconfigPath, updated);
    console.log(`Added plugin to ${name}.`);
  }
}

async function ensureVitePlugin(dir: string): Promise<void> {
  const candidates = [
    "vite.config.ts",
    "vite.config.js",
    "vite.config.mts",
    "vite.config.mjs",
    "vite.config.cts",
    "vite.config.cjs",
  ];
  let viteConfigPath: string | null = null;

  for (const name of candidates) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) {
      viteConfigPath = candidate;
      break;
    }
  }

  if (!viteConfigPath) {
    console.log("No vite config found, skipping Vite plugin setup.");
    return;
  }

  const content = fs.readFileSync(viteConfigPath, "utf-8");
  const configName = path.basename(viteConfigPath);

  if (content.includes(VITE_PLUGIN_IMPORT)) {
    console.log(`${configName} already has the Vite plugin configured.`);
    return;
  }

  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  let updated = content;

  // Add import at the top (after the last existing import)
  const importLine = `import cssModulesDts from "${VITE_PLUGIN_IMPORT}";${eol}`;
  const lastImportMatch = [...updated.matchAll(/^import\s.+$/gm)];
  if (lastImportMatch.length > 0) {
    const last = lastImportMatch[lastImportMatch.length - 1];
    const insertPos = last.index! + last[0].length + eol.length;
    updated =
      updated.slice(0, insertPos) + importLine + updated.slice(insertPos);
  } else {
    updated = importLine + updated;
  }

  // Insert cssModulesDts() into the plugins array, or create one
  const pluginsMatch = updated.match(/plugins\s*:\s*\[/);
  if (pluginsMatch && pluginsMatch.index != null) {
    const insertPos = pluginsMatch.index + pluginsMatch[0].length;
    const afterBracket = updated.slice(insertPos);
    const nlMatch = afterBracket.match(/^(\s*)\S/);
    if (nlMatch && nlMatch[0] !== nlMatch[1]) {
      // Multiline: next non-whitespace is on a new line — match its indent
      const itemIndent = nlMatch[1];
      updated =
        updated.slice(0, insertPos) +
        `${itemIndent}cssModulesDts(),${eol}` +
        updated.slice(insertPos);
    } else {
      // Inline: plugins on one line
      updated =
        updated.slice(0, insertPos) +
        "cssModulesDts(), " +
        updated.slice(insertPos);
    }
  } else {
    // No plugins array — insert one into defineConfig({ or a plain object export
    const configObjMatch =
      updated.match(/defineConfig\(\s*\{/) ??
      updated.match(/export\s+default\s*\{/);
    if (configObjMatch && configObjMatch.index != null) {
      const insertPos = configObjMatch.index + configObjMatch[0].length;
      updated =
        updated.slice(0, insertPos) +
        ` plugins: [cssModulesDts()],` +
        updated.slice(insertPos);
    } else {
      console.error(
        `Warning: could not find plugins array in ${configName}, skipping.`,
      );
      return;
    }
  }

  fs.writeFileSync(viteConfigPath, updated);
  console.log(`Added Vite plugin to ${configName}.`);
}

export async function init(): Promise<void> {
  const dir = process.cwd();

  console.log("Setting up css-modules-lint...\n");

  ensureTsPlugin(dir);
  await ensureVitePlugin(dir);
  ensureGitignore(dir);

  console.log("\nDone! Next steps:");
  console.log("  1. Restart your editor's language server");
  console.log("  2. To enable eslint rules, add to your eslint.config.js:");
  console.log('     import cssModulesLint from "css-modules-lint/eslint";');
  console.log("     export default [...cssModulesLint.configs.recommended];");
  console.log("  3. Add to your CI/lint scripts:");
  console.log('     "lint:css": "css-modules-lint check"');
}
