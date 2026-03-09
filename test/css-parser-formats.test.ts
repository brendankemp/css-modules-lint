import { describe, it, expect } from 'vitest';
import path from 'path';
import { parseStyleFile, findClassPosition, isStyleFile } from '../src/css-parser';
import { writeFixture as _writeFixture } from './test-helpers';

const fixturesDir = path.join(__dirname, 'fixtures');
const writeFixture = (name: string, content: string) => _writeFixture(fixturesDir, name, content);

describe('parseStyleFile - .module.css', () => {
  it('extracts classes from plain CSS', () => {
    const file = writeFixture('plain.module.css', `
      .container { display: flex; }
      .header { font-size: 20px; }
    `);
    const result = parseStyleFile(file);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.classes)).toContain('container');
    expect(Object.keys(result!.classes)).toContain('header');
  });

  it('handles composes in plain CSS', () => {
    const file = writeFixture('composes.module.css', `
      .base { font-size: 14px; }
      .extended { composes: base; color: red; }
    `);
    const result = parseStyleFile(file);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.classes)).toContain('base');
    expect(Object.keys(result!.classes)).toContain('extended');
  });

  it('extracts ICSS :export properties', () => {
    const file = writeFixture('export.module.css', `
      :export { primaryColor: #f00; }
      .container { display: flex; }
    `);
    const result = parseStyleFile(file);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.exportProps)).toContain('primaryColor');
    expect(Object.keys(result!.classes)).toContain('container');
  });

  it('finds class position in CSS file', () => {
    const content = `.container { display: flex; }\n.header { font-size: 20px; }`;
    const file = writeFixture('position.module.css', content);
    const pos = findClassPosition(file, 'header');
    expect(pos).not.toBeNull();
    expect(pos!.line).toBe(1);
    expect(pos!.offset).toBe(content.indexOf('.header'));
  });
});

describe('parseStyleFile - .module.less', () => {
  it('extracts classes from Less', () => {
    const file = writeFixture('basic.module.less', `
      .container { display: flex; }
      .header { font-size: 20px; }
    `);
    const result = parseStyleFile(file);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.classes)).toContain('container');
    expect(Object.keys(result!.classes)).toContain('header');
  });

  it('handles Less variables', () => {
    const file = writeFixture('variables.module.less', `
      @primary: #f00;
      .container { color: @primary; }
    `);
    const result = parseStyleFile(file);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.classes)).toContain('container');
  });

  it('handles Less nesting', () => {
    const file = writeFixture('nested.module.less', `
      .parent {
        color: red;
        .child { color: blue; }
      }
    `);
    const result = parseStyleFile(file);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.classes)).toContain('parent');
    expect(Object.keys(result!.classes)).toContain('child');
  });

  it('finds class position in Less file', () => {
    const content = `.container { display: flex; }\n.header { font-size: 20px; }`;
    const file = writeFixture('position.module.less', content);
    const pos = findClassPosition(file, 'header');
    expect(pos).not.toBeNull();
    expect(pos!.line).toBe(1);
    expect(pos!.offset).toBe(content.indexOf('.header'));
  });
});
