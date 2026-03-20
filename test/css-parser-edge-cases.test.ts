import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { parseStyleFile, removeClasses } from '../src/css-parser';
import { writeFixture as _writeFixture } from './test-helpers';

const fixturesDir = path.join(__dirname, 'fixtures');
const writeFixture = (name: string, content: string) => _writeFixture(fixturesDir, name, content);

/** Helper: parse and return the class names as a sorted array */
function classNames(file: string): string[] {
  const result = parseStyleFile(file);
  expect(result).not.toBeNull();
  return Object.keys(result!.classes).sort();
}

/** Helper: parse and return the class map (name → used/unused) */
function classMap(file: string): Record<string, boolean | string> {
  const result = parseStyleFile(file);
  expect(result).not.toBeNull();
  return result!.classes;
}

// ---------------------------------------------------------------------------
// Deep nesting with &
// ---------------------------------------------------------------------------
describe('deep nesting', () => {
  it('resolves 3 levels of & suffixes', () => {
    const file = writeFixture('deep-3.module.scss', `
      .block {
        &_element {
          &_modifier { color: red; }
        }
      }
    `);
    expect(classNames(file)).toContain('block_element_modifier');
    expect(classNames(file)).toContain('block_element');
  });

  it('resolves 4 levels of & suffixes', () => {
    const file = writeFixture('deep-4.module.scss', `
      .a {
        &_b {
          &_c {
            &_d { color: red; }
          }
        }
      }
    `);
    expect(classNames(file)).toContain('a_b_c_d');
  });

  it('resolves deep nesting with hyphens', () => {
    const file = writeFixture('deep-hyphen.module.scss', `
      .nav {
        &-item {
          &-link { text-decoration: none; }
          &-icon { width: 16px; }
        }
      }
    `);
    const names = classNames(file);
    expect(names).toContain('nav-item-link');
    expect(names).toContain('nav-item-icon');
    expect(names).toContain('nav-item');
  });
});

// ---------------------------------------------------------------------------
// & with pseudo-classes and pseudo-elements
// ---------------------------------------------------------------------------
describe('& with pseudo-classes/elements', () => {
  it('does not create new class for &:hover', () => {
    const file = writeFixture('ampersand-hover.module.scss', `
      .button {
        color: blue;
        &:hover { color: red; }
        &:focus { outline: 2px solid; }
      }
    `);
    const names = classNames(file);
    expect(names).toContain('button');
    expect(names).toHaveLength(1);
  });

  it('does not create new class for &::before/&::after', () => {
    const file = writeFixture('ampersand-pseudo-el.module.scss', `
      .icon {
        position: relative;
        &::before { content: ""; }
        &::after { content: ""; }
      }
    `);
    const names = classNames(file);
    expect(names).toContain('icon');
    expect(names).toHaveLength(1);
  });

  it('handles & suffix AND pseudo on same rule', () => {
    const file = writeFixture('ampersand-suffix-pseudo.module.scss', `
      .btn {
        &_primary { color: blue; }
        &_primary:hover { color: darkblue; }
      }
    `);
    const names = classNames(file);
    expect(names).toContain('btn_primary');
  });
});

// ---------------------------------------------------------------------------
// Multiple parent selectors (comma-separated)
// ---------------------------------------------------------------------------
describe('multiple parent selectors', () => {
  it('resolves & suffix against each parent in comma selector', () => {
    const file = writeFixture('multi-parent.module.scss', `
      .card, .panel {
        &_header { font-weight: bold; }
      }
    `);
    const names = classNames(file);
    expect(names).toContain('card_header');
    expect(names).toContain('panel_header');
  });
});

// ---------------------------------------------------------------------------
// @media inside nested rules
// ---------------------------------------------------------------------------
describe('@media inside nesting', () => {
  it('resolves & suffix inside @media nested within a class', () => {
    const file = writeFixture('media-nested.module.scss', `
      .container {
        &_sidebar {
          width: 300px;
          @media (max-width: 768px) {
            &_collapsed { width: 0; }
          }
        }
      }
    `);
    const names = classNames(file);
    expect(names).toContain('container_sidebar');
    // The &_collapsed inside @media should resolve against container_sidebar
    expect(names).toContain('container_sidebar_collapsed');
  });

  it('extracts classes from @media at top level', () => {
    const file = writeFixture('media-top.module.scss', `
      .desktop { display: block; }
      @media (max-width: 768px) {
        .mobile { display: block; }
        .desktop { display: none; }
      }
    `);
    const names = classNames(file);
    expect(names).toContain('desktop');
    expect(names).toContain('mobile');
  });
});

// ---------------------------------------------------------------------------
// Selector complexity: chained, descendant, sibling, child
// ---------------------------------------------------------------------------
describe('complex selectors', () => {
  it('extracts both classes from chained selector .foo.bar', () => {
    const file = writeFixture('chained.module.scss', `
      .button.primary { background: blue; }
    `);
    const names = classNames(file);
    expect(names).toContain('button');
    expect(names).toContain('primary');
  });

  it('extracts both classes from descendant selector', () => {
    const file = writeFixture('descendant.module.scss', `
      .parent .child { color: red; }
    `);
    const names = classNames(file);
    expect(names).toContain('parent');
    expect(names).toContain('child');
  });

  it('extracts both classes from child combinator', () => {
    const file = writeFixture('child-comb.module.scss', `
      .parent > .child { color: red; }
    `);
    const names = classNames(file);
    expect(names).toContain('parent');
    expect(names).toContain('child');
  });

  it('extracts classes from sibling combinators', () => {
    const file = writeFixture('sibling.module.scss', `
      .label + .input { margin-top: 4px; }
      .error ~ .hint { display: none; }
    `);
    const names = classNames(file);
    expect(names).toContain('label');
    expect(names).toContain('input');
    expect(names).toContain('error');
    expect(names).toContain('hint');
  });

  it('extracts classes from attribute selector combined with class', () => {
    const file = writeFixture('attr-class.module.scss', `
      .input[type="text"] { border: 1px solid; }
    `);
    const names = classNames(file);
    expect(names).toContain('input');
  });
});

// ---------------------------------------------------------------------------
// Pseudo-selectors containing class arguments
// ---------------------------------------------------------------------------
describe('pseudo-selectors with class args', () => {
  it('extracts class inside :not()', () => {
    const file = writeFixture('not-pseudo.module.scss', `
      .item:not(.disabled) { cursor: pointer; }
    `);
    const names = classNames(file);
    expect(names).toContain('item');
    expect(names).toContain('disabled');
  });

  it('extracts class inside :has()', () => {
    const file = writeFixture('has-pseudo.module.scss', `
      .container:has(.active) { border: 2px solid blue; }
    `);
    const names = classNames(file);
    expect(names).toContain('container');
    expect(names).toContain('active');
  });

  it('extracts classes inside :is()', () => {
    const file = writeFixture('is-pseudo.module.scss', `
      :is(.heading, .title) { font-weight: bold; }
    `);
    const names = classNames(file);
    expect(names).toContain('heading');
    expect(names).toContain('title');
  });

  it('extracts classes inside :where()', () => {
    const file = writeFixture('where-pseudo.module.scss', `
      :where(.card, .panel) .body { padding: 16px; }
    `);
    const names = classNames(file);
    expect(names).toContain('card');
    expect(names).toContain('panel');
    expect(names).toContain('body');
  });
});

// ---------------------------------------------------------------------------
// :global / :local edge cases
// ---------------------------------------------------------------------------
describe(':global and :local edge cases', () => {
  it('handles :global with multiple classes in parens', () => {
    const file = writeFixture('global-multi.module.css', `
      :global(.reset) .local { color: red; }
    `);
    const names = classNames(file);
    expect(names).not.toContain('reset');
    expect(names).toContain('local');
  });

  it('handles :global inside a nested rule', () => {
    const file = writeFixture('global-nested.module.scss', `
      .wrapper {
        :global(.external) { color: red; }
        .inner { color: blue; }
      }
    `);
    const names = classNames(file);
    expect(names).toContain('wrapper');
    expect(names).toContain('inner');
    expect(names).not.toContain('external');
  });

  it('handles :global/:local toggling in one selector', () => {
    const file = writeFixture('global-local-toggle.module.css', `
      :global .reset :local .scoped { color: red; }
    `);
    const names = classNames(file);
    expect(names).not.toContain('reset');
    expect(names).toContain('scoped');
  });

  it('handles :local() explicit wrapping', () => {
    const file = writeFixture('local-explicit.module.css', `
      :local(.myClass) { color: red; }
    `);
    const names = classNames(file);
    expect(names).toContain('myClass');
  });

  it('does not extract classes from a pure :global block', () => {
    const file = writeFixture('global-block.module.scss', `
      :global {
        .globalOnly { color: red; }
      }
      .localClass { color: blue; }
    `);
    const names = classNames(file);
    expect(names).not.toContain('globalOnly');
    expect(names).toContain('localClass');
  });
});

// ---------------------------------------------------------------------------
// composes edge cases
// ---------------------------------------------------------------------------
describe('composes edge cases', () => {
  it('handles composes with multiple classes', () => {
    const file = writeFixture('composes-multi.module.css', `
      .a { font-size: 14px; }
      .b { font-weight: bold; }
      .c { composes: a b; color: red; }
    `);
    const map = classMap(file);
    expect(map['a']).toBe(true);
    expect(map['b']).toBe(true);
    expect(Object.keys(map)).toContain('c');
  });

  it('handles composes from external file (ignored)', () => {
    const file = writeFixture('composes-ext.module.css', `
      .local { composes: foo from './other.module.css'; color: red; }
    `);
    const names = classNames(file);
    expect(names).toContain('local');
    expect(names).not.toContain('foo');
  });
});

// ---------------------------------------------------------------------------
// @extend edge cases
// ---------------------------------------------------------------------------
describe('@extend edge cases', () => {
  it('handles @extend with hyphenated class', () => {
    const file = writeFixture('extend-hyphen.module.scss', `
      .base-style { font-size: 14px; }
      .derived { @extend .base-style; color: blue; }
    `);
    const map = classMap(file);
    expect(map['base-style']).toBe(true);
    expect(Object.keys(map)).toContain('derived');
  });
});

// ---------------------------------------------------------------------------
// Class name formats
// ---------------------------------------------------------------------------
describe('class name formats', () => {
  it('handles hyphenated class names', () => {
    const file = writeFixture('hyphen.module.scss', `
      .my-component { display: flex; }
      .my-component__header { font-size: 20px; }
    `);
    const names = classNames(file);
    expect(names).toContain('my-component');
    expect(names).toContain('my-component__header');
  });

  it('handles underscore-prefixed class names', () => {
    const file = writeFixture('underscore.module.scss', `
      ._private { display: none; }
    `);
    expect(classNames(file)).toContain('_private');
  });

  it('handles class names with numbers', () => {
    const file = writeFixture('numbers.module.scss', `
      .col-12 { width: 100%; }
      .mt-0 { margin-top: 0; }
      .h1 { font-size: 2em; }
    `);
    const names = classNames(file);
    expect(names).toContain('col-12');
    expect(names).toContain('mt-0');
    expect(names).toContain('h1');
  });

  it('handles camelCase class names', () => {
    const file = writeFixture('camel.module.scss', `
      .myComponent { display: flex; }
      .headerTitle { font-size: 20px; }
    `);
    const names = classNames(file);
    expect(names).toContain('myComponent');
    expect(names).toContain('headerTitle');
  });
});

// ---------------------------------------------------------------------------
// Empty and minimal files
// ---------------------------------------------------------------------------
describe('edge case files', () => {
  it('handles empty stylesheet', () => {
    const file = writeFixture('empty.module.scss', '');
    const result = parseStyleFile(file);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.classes)).toHaveLength(0);
  });

  it('handles stylesheet with only comments', () => {
    const file = writeFixture('comments-only.module.scss', `
      /* This file is intentionally empty */
      // Another comment
    `);
    const result = parseStyleFile(file);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.classes)).toHaveLength(0);
  });

  it('handles stylesheet with only :export', () => {
    const file = writeFixture('export-only.module.scss', `
      :export { primaryColor: #f00; gap: 16px; }
    `);
    const result = parseStyleFile(file);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.classes)).toHaveLength(0);
    expect(Object.keys(result!.exportProps)).toContain('primaryColor');
    expect(Object.keys(result!.exportProps)).toContain('gap');
  });

  it('handles duplicate class definitions across rules', () => {
    const file = writeFixture('duplicate.module.scss', `
      .card { color: red; }
      .card { background: white; }
      @media (max-width: 768px) {
        .card { font-size: 14px; }
      }
    `);
    const names = classNames(file);
    // Should appear once, not duplicated
    expect(names.filter(n => n === 'card')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// @keyframes, @supports, @font-face
// ---------------------------------------------------------------------------
describe('at-rules that should not produce classes', () => {
  it('does not extract class-like names from @keyframes', () => {
    const file = writeFixture('keyframes.module.scss', `
      .animated { animation: fadeIn 1s; }
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `);
    const names = classNames(file);
    expect(names).toContain('animated');
    // "from" and "to" should not appear as classes
    expect(names).not.toContain('from');
    expect(names).not.toContain('to');
  });

  it('extracts classes inside @supports', () => {
    const file = writeFixture('supports.module.scss', `
      @supports (display: grid) {
        .grid { display: grid; }
      }
      .fallback { display: flex; }
    `);
    const names = classNames(file);
    expect(names).toContain('grid');
    expect(names).toContain('fallback');
  });
});

// ---------------------------------------------------------------------------
// Compound & variations inside nesting
// ---------------------------------------------------------------------------
describe('compound & selectors', () => {
  it('extracts class from &.modifier', () => {
    const file = writeFixture('compound-mod.module.scss', `
      .button {
        color: gray;
        &.active { color: blue; }
        &.disabled { color: lightgray; }
      }
    `);
    const names = classNames(file);
    expect(names).toContain('button');
    expect(names).toContain('active');
    expect(names).toContain('disabled');
  });

  it('extracts classes from mixed & patterns in one parent', () => {
    const file = writeFixture('mixed-amp.module.scss', `
      .card {
        padding: 16px;
        &_header { font-weight: bold; }
        &.featured { border: 2px solid gold; }
        &:hover { box-shadow: 0 2px 4px; }
        &::after { content: ""; }
      }
    `);
    const names = classNames(file);
    expect(names).toContain('card');
    expect(names).toContain('card_header');
    expect(names).toContain('featured');
    // :hover and ::after should NOT produce classes
    expect(names).not.toContain('hover');
    expect(names).not.toContain('after');
  });

  it('handles & suffix combined with compound modifier', () => {
    const file = writeFixture('suffix-compound.module.scss', `
      .nav {
        &_item {
          color: gray;
          &.active { color: blue; }
        }
      }
    `);
    const names = classNames(file);
    expect(names).toContain('nav_item');
    expect(names).toContain('active');
  });
});

// ---------------------------------------------------------------------------
// Less-specific edge cases
// ---------------------------------------------------------------------------
describe('Less edge cases', () => {
  it('handles Less & nesting like SCSS', () => {
    const file = writeFixture('less-amp.module.less', `
      .block {
        &_element { color: red; }
        &-modifier { color: blue; }
      }
    `);
    const names = classNames(file);
    expect(names).toContain('block_element');
    expect(names).toContain('block-modifier');
  });

  it('handles Less :extend', () => {
    const file = writeFixture('less-extend.module.less', `
      .base { font-size: 14px; }
      .derived {
        &:extend(.base);
        color: blue;
      }
    `);
    // Less :extend syntax is different from SCSS @extend
    // Just verify it doesn't crash and extracts classes
    const names = classNames(file);
    expect(names).toContain('base');
    expect(names).toContain('derived');
  });

  it('handles Less mixins without crashing', () => {
    const file = writeFixture('less-mixin.module.less', `
      .border-radius(@radius) {
        border-radius: @radius;
      }
      .card {
        .border-radius(4px);
        color: red;
      }
    `);
    const names = classNames(file);
    expect(names).toContain('card');
  });
});

// ---------------------------------------------------------------------------
// Removal edge cases
// ---------------------------------------------------------------------------
describe('removeClasses edge cases', () => {
  it('removes class from descendant selector (both classes in rule)', () => {
    const file = writeFixture('remove-descendant.module.scss',
      `.parent .remove { color: red; }\n.keep { color: blue; }\n`);
    const changed = removeClasses(file, new Set(['remove', 'parent']));
    expect(changed).toBe(true);
    const result = fs.readFileSync(file, 'utf-8');
    expect(result).not.toContain('.parent');
    expect(result).not.toContain('.remove');
    expect(result).toContain('.keep');
  });

  it('removes deeply nested & suffix class', () => {
    const file = writeFixture('remove-deep.module.scss', `
.block {
  color: red;
  &_element {
    color: blue;
    &_modifier { color: green; }
    &_keep { color: yellow; }
  }
}
`);
    const changed = removeClasses(file, new Set(['block_element_modifier']));
    expect(changed).toBe(true);
    const result = fs.readFileSync(file, 'utf-8');
    expect(result).toContain('&_keep');
    expect(result).not.toContain('&_modifier');
  });

  it('cleans up empty @media after removal', () => {
    const file = writeFixture('remove-empty-media.module.scss', `
.keep { color: red; }
@media (max-width: 768px) {
  .remove { display: none; }
}
`);
    const changed = removeClasses(file, new Set(['remove']));
    expect(changed).toBe(true);
    const result = fs.readFileSync(file, 'utf-8');
    expect(result).toContain('.keep');
    expect(result).not.toContain('@media');
    expect(result).not.toContain('.remove');
  });
});

// ---------------------------------------------------------------------------
// Parent class used-marking (pure wrapper vs. has declarations)
// ---------------------------------------------------------------------------
describe('parent class used-marking', () => {
  it('marks parent as used when it has only & children and no own declarations', () => {
    const file = writeFixture('parent-used.module.scss', `
      .wrapper {
        &_child { color: red; }
      }
    `);
    const map = classMap(file);
    expect(map['wrapper']).toBe(true);
  });

  it('marks parent as unused when it has own declarations', () => {
    const file = writeFixture('parent-unused.module.scss', `
      .wrapper {
        display: flex;
        &_child { color: red; }
      }
    `);
    const map = classMap(file);
    expect(map['wrapper']).toBe(false);
  });

  it('marks parent as unused when it has no & children', () => {
    const file = writeFixture('parent-no-amp.module.scss', `
      .wrapper {
        display: flex;
      }
    `);
    const map = classMap(file);
    expect(map['wrapper']).toBe(false);
  });
});
