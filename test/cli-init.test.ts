import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';

// cli-init uses process.cwd() to find the project root, so we need to mock it
const fixturesDir = path.join(__dirname, 'fixtures', 'init');

// The functions are not individually exported, so we import the module
// and test init() end-to-end by setting up different project directories
// For more granular tests, we'll extract and test the logic directly.

// Since the functions are not exported individually, let's test via the file operations directly
// by reimporting the relevant pieces. Actually, let's just test init() with cwd mocked.

import { init } from '../src/cli-init';

function writeFile(name: string, content: string): string {
  const filePath = path.join(fixturesDir, name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

function readFile(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), 'utf-8');
}

describe('cli-init', () => {
  beforeEach(() => {
    fs.rmSync(fixturesDir, { recursive: true, force: true });
    fs.mkdirSync(fixturesDir, { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(fixturesDir);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('tsconfig plugin', () => {
    it('adds plugin to tsconfig.json', async () => {
      writeFile('tsconfig.json', JSON.stringify({
        compilerOptions: { target: 'ES2020' },
      }));

      await init();

      const config = JSON.parse(readFile('tsconfig.json'));
      expect(config.compilerOptions.plugins).toEqual([
        { name: 'ts-css-modules-lint' },
      ]);
    });

    it('adds plugin to tsconfig.app.json', async () => {
      writeFile('tsconfig.app.json', JSON.stringify({
        compilerOptions: { target: 'ES2020' },
      }));

      await init();

      const config = JSON.parse(readFile('tsconfig.app.json'));
      expect(config.compilerOptions.plugins).toEqual([
        { name: 'ts-css-modules-lint' },
      ]);
    });

    it('does not duplicate plugin if already present', async () => {
      writeFile('tsconfig.json', JSON.stringify({
        compilerOptions: {
          plugins: [{ name: 'ts-css-modules-lint' }],
        },
      }));

      await init();

      const config = JSON.parse(readFile('tsconfig.json'));
      expect(config.compilerOptions.plugins).toHaveLength(1);
    });

    it('creates plugins array if missing', async () => {
      writeFile('tsconfig.json', JSON.stringify({}));

      await init();

      const config = JSON.parse(readFile('tsconfig.json'));
      expect(config.compilerOptions.plugins).toEqual([
        { name: 'ts-css-modules-lint' },
      ]);
    });
  });

  describe('gitignore', () => {
    it('adds .d.ts patterns to .gitignore', async () => {
      writeFile('.gitignore', 'node_modules\n');

      await init();

      const content = readFile('.gitignore');
      expect(content).toContain('*.module.scss.d.ts');
      expect(content).toContain('*.module.css.d.ts');
      expect(content).toContain('*.module.less.d.ts');
    });

    it('creates .gitignore if missing', async () => {
      // No .gitignore exists
      writeFile('tsconfig.json', JSON.stringify({}));

      await init();

      const content = readFile('.gitignore');
      expect(content).toContain('*.module.scss.d.ts');
    });

    it('does not duplicate entries', async () => {
      writeFile('.gitignore', '*.module.scss.d.ts\n*.module.css.d.ts\n*.module.less.d.ts\n');

      await init();

      const content = readFile('.gitignore');
      const scssCount = content.split('*.module.scss.d.ts').length - 1;
      expect(scssCount).toBe(1);
    });
  });

  describe('vite plugin', () => {
    it('adds plugin to vite.config.ts', async () => {
      writeFile('vite.config.ts', [
        'import { defineConfig } from "vite";',
        'export default defineConfig({});',
      ].join('\n'));

      await init();

      const content = readFile('vite.config.ts');
      expect(content).toContain('ts-css-modules-lint/vite');
      expect(content).toContain('cssModulesDts');
    });

    it('skips if no vite config found', async () => {
      writeFile('tsconfig.json', JSON.stringify({}));
      // No vite.config.ts

      await init(); // should not throw

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('No vite config found')
      );
    });

    it('does not duplicate if already configured', async () => {
      writeFile('vite.config.ts', [
        'import { defineConfig } from "vite";',
        'import cssModulesDts from "ts-css-modules-lint/vite";',
        'export default defineConfig({ plugins: [cssModulesDts()] });',
      ].join('\n'));

      await init();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('already has the Vite plugin')
      );
    });
  });
});
