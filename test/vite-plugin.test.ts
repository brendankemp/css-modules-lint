import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import cssModulesDts from '../src/vite-plugin';
import { writeFixture as _writeFixture } from './test-helpers';

const fixturesDir = path.join(__dirname, 'fixtures', 'vite');
const writeFixture = (name: string, content: string) => _writeFixture(fixturesDir, name, content);

beforeEach(() => {
  fs.mkdirSync(fixturesDir, { recursive: true });
});

afterEach(() => {
  // Clean up .d.ts files
  if (fs.existsSync(fixturesDir)) {
    for (const file of fs.readdirSync(fixturesDir)) {
      if (file.endsWith('.d.ts')) {
        fs.unlinkSync(path.join(fixturesDir, file));
      }
    }
  }
});

describe('vite plugin', () => {
  it('does not block buildStart in dev mode', () => {
    const plugin = cssModulesDts();

    // Default is 'serve' (dev mode)
    const scssFile = writeFixture('nonblock.module.scss', '.foo { color: red; }');
    const dtsFile = scssFile + '.d.ts';

    // Mock cwd to point to fixtures dir
    const origCwd = process.cwd;
    process.cwd = () => fixturesDir;

    try {
      plugin.buildStart!();

      // .d.ts should NOT exist yet — generation is deferred via setImmediate
      expect(fs.existsSync(dtsFile)).toBe(false);
    } finally {
      process.cwd = origCwd;
    }
  });

  it('does not generate in buildStart for build mode (getJSON handles it)', () => {
    const plugin = cssModulesDts();
    plugin.configResolved!({ command: 'build' });

    const scssFile = writeFixture('block.module.scss', '.bar { color: blue; }');
    const dtsFile = scssFile + '.d.ts';

    const origCwd = process.cwd;
    process.cwd = () => fixturesDir;

    try {
      plugin.buildStart!();

      // .d.ts should NOT exist — build mode relies on getJSON
      expect(fs.existsSync(dtsFile)).toBe(false);
    } finally {
      process.cwd = origCwd;
    }
  });

  it('generates .d.ts after setImmediate in dev mode', async () => {
    const plugin = cssModulesDts();

    const scssFile = writeFixture('deferred.module.scss', '.baz { color: green; }');
    const dtsFile = scssFile + '.d.ts';

    const origCwd = process.cwd;
    process.cwd = () => fixturesDir;

    try {
      plugin.buildStart!();

      // Wait for setImmediate to fire
      await new Promise(resolve => setImmediate(resolve));

      // Now the .d.ts should exist
      expect(fs.existsSync(dtsFile)).toBe(true);
      const content = fs.readFileSync(dtsFile, 'utf-8');
      expect(content).toContain('baz');
    } finally {
      process.cwd = origCwd;
    }
  });

  it('generates .d.ts via config getJSON hook', () => {
    const plugin = cssModulesDts();
    const scssFile = writeFixture('getjson.module.scss', '.card { color: red; }');
    const dtsFile = scssFile + '.d.ts';

    // Get the config hook's return value
    const configResult = plugin.config!({});
    const getJSON = configResult.css.modules.getJSON;

    // Simulate Vite calling getJSON with class name mappings
    getJSON(scssFile, { card: 'card_hash123', header: 'header_hash456' }, '');

    expect(fs.existsSync(dtsFile)).toBe(true);
    const content = fs.readFileSync(dtsFile, 'utf-8');
    expect(content).toContain('card');
    expect(content).toContain('header');
  });

  it('preserves user getJSON callback', () => {
    const plugin = cssModulesDts();
    const scssFile = writeFixture('usercb.module.scss', '.btn { color: red; }');

    const userGetJSON = vi.fn();
    const configResult = plugin.config!({
      css: { modules: { getJSON: userGetJSON } },
    });
    const getJSON = configResult.css.modules.getJSON;

    const json = { btn: 'btn_hash' };
    getJSON(scssFile, json, 'output.css');

    expect(userGetJSON).toHaveBeenCalledWith(scssFile, json, 'output.css');
  });

  it('ignores non-module files in getJSON', () => {
    const plugin = cssModulesDts();
    const cssFile = path.join(fixturesDir, 'plain.css');
    fs.writeFileSync(cssFile, '.foo { color: red; }');
    const dtsFile = cssFile + '.d.ts';

    const configResult = plugin.config!({});
    configResult.css.modules.getJSON(cssFile, { foo: 'foo_hash' }, '');

    expect(fs.existsSync(dtsFile)).toBe(false);
  });

  it('removes .d.ts on file deletion via watchChange', () => {
    const plugin = cssModulesDts();
    const scssFile = writeFixture('deleteme.module.scss', '.gone { color: red; }');
    const dtsFile = scssFile + '.d.ts';

    // Create the .d.ts first
    fs.writeFileSync(dtsFile, 'placeholder');
    expect(fs.existsSync(dtsFile)).toBe(true);

    plugin.watchChange!(scssFile, { event: 'delete' });

    expect(fs.existsSync(dtsFile)).toBe(false);
  });
});
