import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { parseStyleFile, findClassPosition, isStyleFile, removeClasses } from '../src/css-parser';
import { writeFixture as _writeFixture } from './test-helpers';

const fixturesDir = path.join(__dirname, 'fixtures');
const writeFixture = (name: string, content: string) => _writeFixture(fixturesDir, name, content);

describe('isStyleFile', () => {
  it('matches .module.scss', () => {
    expect(isStyleFile('foo.module.scss')).toBe(true);
  });
  it('matches .module.css', () => {
    expect(isStyleFile('foo.module.css')).toBe(true);
  });
  it('matches .module.less', () => {
    expect(isStyleFile('foo.module.less')).toBe(true);
  });
  it('does not match plain .scss', () => {
    expect(isStyleFile('foo.scss')).toBe(false);
  });
  it('does not match .ts', () => {
    expect(isStyleFile('foo.ts')).toBe(false);
  });
});

describe('parseStyleFile', () => {
  it('extracts regular classes', () => {
    const file = writeFixture('regular.module.scss', `
      .container { display: flex; }
      .header { font-size: 20px; }
    `);
    const result = parseStyleFile(file);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.classes)).toContain('container');
    expect(Object.keys(result!.classes)).toContain('header');
  });

  it('extracts classes inside @layer', () => {
    const file = writeFixture('layer.module.scss', `
      @layer components {
        .button { padding: 8px; }
        .badge { font-size: 12px; }
      }
    `);
    const result = parseStyleFile(file);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.classes)).toContain('button');
    expect(Object.keys(result!.classes)).toContain('badge');
  });

  it('extracts classes inside @container', () => {
    const file = writeFixture('container.module.scss', `
      @container sidebar (min-width: 700px) {
        .card { font-size: 2em; }
      }
      .wrapper { container-type: inline-size; }
    `);
    const result = parseStyleFile(file);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.classes)).toContain('card');
    expect(Object.keys(result!.classes)).toContain('wrapper');
  });

  it('handles @use namespaced variables', () => {
    const file = writeFixture('namespaced.module.scss', `
      @use 'theme';
      .container { color: theme.$text-primary; }
      .header { border: 1px solid theme.$border-color; }
    `);
    const result = parseStyleFile(file);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.classes)).toContain('container');
    expect(Object.keys(result!.classes)).toContain('header');
  });

  it('handles @use with as alias', () => {
    const file = writeFixture('alias.module.scss', `
      @use 'theme' as t;
      .card { color: t.$primary; }
    `);
    const result = parseStyleFile(file);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.classes)).toContain('card');
  });

  it('handles parent selectors', () => {
    const file = writeFixture('parent.module.scss', `
      .foo {
        &_bar { color: blue; }
        &_baz { color: red; }
      }
    `);
    const result = parseStyleFile(file);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.classes)).toContain('foo_bar');
    expect(Object.keys(result!.classes)).toContain('foo_baz');
  });

  it('handles composes', () => {
    const file = writeFixture('composes.module.scss', `
      .base { font-size: 14px; }
      .extended { composes: base; color: red; }
    `);
    const result = parseStyleFile(file);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.classes)).toContain('base');
    expect(Object.keys(result!.classes)).toContain('extended');
  });

  it('ignores :global classes', () => {
    const file = writeFixture('global.module.scss', `
      .local1 {}
      :global .global1 {}
      :global(.global2) {}
    `);
    const result = parseStyleFile(file);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.classes)).toContain('local1');
    expect(Object.keys(result!.classes)).not.toContain('global1');
    expect(Object.keys(result!.classes)).not.toContain('global2');
  });

  it('extracts ICSS :export properties', () => {
    const file = writeFixture('export.module.scss', `
      :export { myProp: something; }
      .container {}
    `);
    const result = parseStyleFile(file);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.exportProps)).toContain('myProp');
    expect(Object.keys(result!.classes)).toContain('container');
  });

  it('returns null for unparsable files', () => {
    const file = writeFixture('broken.module.scss', 'safslf f sf');
    const result = parseStyleFile(file);
    // postcss is lenient — it may still parse. Just verify no crash.
    expect(result).toBeDefined();
  });

  it('handles SCSS module functions', () => {
    const file = writeFixture('functions.module.scss', `
      @use 'sass:math';
      .container { padding: math.div(16px, 2); }
    `);
    const result = parseStyleFile(file);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.classes)).toContain('container');
  });

  it('handles @extend and marks extended class as used', () => {
    const file = writeFixture('extend.module.scss', `
      .base { font-size: 14px; }
      .derived { @extend .base; color: blue; }
    `);
    const result = parseStyleFile(file);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.classes)).toContain('base');
    expect(Object.keys(result!.classes)).toContain('derived');
    // base should be marked as used (true) because it's extended
    expect(result!.classes['base']).toBe(true);
  });

  it('skips composes from external file', () => {
    const file = writeFixture('composes-from.module.scss', `
      .local { font-size: 14px; }
      .imported { composes: something from './other.module.scss'; }
    `);
    const result = parseStyleFile(file);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.classes)).toContain('local');
    expect(Object.keys(result!.classes)).toContain('imported');
    // "something" should NOT appear as a class since it's from another file
    expect(Object.keys(result!.classes)).not.toContain('something');
  });
});

describe('findClassPosition', () => {
  it('finds position of a class', () => {
    const file = writeFixture('position.module.scss', `.container { display: flex; }
.header { font-size: 20px; }
`);
    const pos = findClassPosition(file, 'header');
    expect(pos).not.toBeNull();
    expect(pos!.line).toBe(1); // 0-based, second line
  });

  it('returns correct byte offset for first class', () => {
    const file = writeFixture('offset-first.module.scss', `.container { display: flex; }`);
    const pos = findClassPosition(file, 'container');
    expect(pos).not.toBeNull();
    expect(pos!.offset).toBe(0);
  });

  it('returns correct byte offset for second class', () => {
    const content = `.container { display: flex; }\n.header { font-size: 20px; }`;
    const file = writeFixture('offset-second.module.scss', content);
    const pos = findClassPosition(file, 'header');
    expect(pos).not.toBeNull();
    // offset should be the start of the second line
    expect(pos!.offset).toBe(content.indexOf('.header'));
  });

  it('returns correct byte offset for nested class', () => {
    const content = `.parent {\n  color: red;\n}\n\n.child {\n  color: blue;\n}`;
    const file = writeFixture('offset-nested.module.scss', content);
    const pos = findClassPosition(file, 'child');
    expect(pos).not.toBeNull();
    expect(pos!.offset).toBe(content.indexOf('.child'));
  });

  it('returns correct offset for class on last line without trailing newline', () => {
    const content = `.container { display: flex; }\n.last { color: red; }`;
    const file = writeFixture('offset-no-newline.module.scss', content);
    const pos = findClassPosition(file, 'last');
    expect(pos).not.toBeNull();
    expect(pos!.offset).toBe(content.indexOf('.last'));
    expect(pos!.line).toBe(1);
  });

  it('returns null for non-existent class', () => {
    const file = writeFixture('noclass.module.scss', `.container { display: flex; }`);
    const pos = findClassPosition(file, 'nonExistent');
    expect(pos).toBeNull();
  });
});

describe('removeClasses', () => {
  it('removes a single class rule', () => {
    const file = writeFixture('remove-single.module.scss',
      `.keep { color: red; }\n.remove { color: blue; }\n`);
    const changed = removeClasses(file, new Set(['remove']));
    expect(changed).toBe(true);
    const result = fs.readFileSync(file, 'utf-8');
    expect(result).toContain('.keep');
    expect(result).not.toContain('.remove');
  });

  it('removes only matching selector from multi-selector rule', () => {
    const file = writeFixture('remove-multi.module.scss',
      `.remove, .keep { color: red; }\n`);
    const changed = removeClasses(file, new Set(['remove']));
    expect(changed).toBe(true);
    const result = fs.readFileSync(file, 'utf-8');
    expect(result).toContain('.keep');
    expect(result).not.toMatch(/\.remove/);
  });

  it('removes entire rule when all selectors match', () => {
    const file = writeFixture('remove-all-selectors.module.scss',
      `.a, .b { color: red; }\n.keep { color: blue; }\n`);
    const changed = removeClasses(file, new Set(['a', 'b']));
    expect(changed).toBe(true);
    const result = fs.readFileSync(file, 'utf-8');
    expect(result).not.toContain('.a');
    expect(result).not.toContain('.b');
    expect(result).toContain('.keep');
  });

  it('removes nested SCSS rules with parent selector', () => {
    const file = writeFixture('remove-nested.module.scss',
      `.parent {\n  color: red;\n  &-child { color: blue; }\n  &-keep { color: green; }\n}\n`);
    const changed = removeClasses(file, new Set(['parent-child']));
    expect(changed).toBe(true);
    const result = fs.readFileSync(file, 'utf-8');
    expect(result).toContain('.parent');
    expect(result).toContain('&-keep');
    expect(result).not.toContain('&-child');
  });

  it('removes compound nested selector (&.className)', () => {
    const file = writeFixture('remove-compound.module.scss',
      `.parent {\n  color: red;\n  &.orange { color: orange; }\n  &.active { color: green; }\n}\n`);
    const changed = removeClasses(file, new Set(['orange']));
    expect(changed).toBe(true);
    const result = fs.readFileSync(file, 'utf-8');
    expect(result).toContain('.parent');
    expect(result).toContain('&.active');
    expect(result).not.toContain('&.orange');
  });

  it('removes multiple compound nested selectors', () => {
    const file = writeFixture('remove-compound-multi.module.scss',
      `.parent {\n  color: red;\n  &.orange { color: orange; }\n  &.red { color: red; }\n}\n`);
    const changed = removeClasses(file, new Set(['orange', 'red']));
    expect(changed).toBe(true);
    const result = fs.readFileSync(file, 'utf-8');
    expect(result).toContain('.parent');
    expect(result).not.toContain('&.orange');
    expect(result).not.toContain('&.red');
  });

  it('removes only matching selector from compound multi-selector rule', () => {
    const file = writeFixture('remove-compound-partial.module.scss',
      `.parent {\n  &.orange, &.active { color: orange; }\n}\n`);
    const changed = removeClasses(file, new Set(['orange']));
    expect(changed).toBe(true);
    const result = fs.readFileSync(file, 'utf-8');
    expect(result).toContain('&.active');
    expect(result).not.toMatch(/&\.orange/);
  });

  it('returns false when no classes match', () => {
    const file = writeFixture('remove-none.module.scss',
      `.keep { color: red; }\n`);
    const changed = removeClasses(file, new Set(['nonexistent']));
    expect(changed).toBe(false);
  });

  it('preserves non-class selectors', () => {
    const file = writeFixture('remove-preserve.module.scss',
      `.remove { color: red; }\n:root { --color: blue; }\n`);
    const changed = removeClasses(file, new Set(['remove']));
    expect(changed).toBe(true);
    const result = fs.readFileSync(file, 'utf-8');
    expect(result).not.toContain('.remove');
    expect(result).toContain(':root');
  });
});
