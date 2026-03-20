import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import plugin from '../src/eslint-plugin';
import { writeFixture as _writeFixture } from './test-helpers';

const baseFixturesDir = path.join(__dirname, 'fixtures', 'eslint');
let testCounter = 0;

/**
 * Each test gets a unique subdirectory so typescript-eslint's project cache
 * never serves stale programs from a previous test.
 */
function setupTestDir(): { dir: string; writeFixture: (name: string, content: string) => string } {
  const dir = path.join(baseFixturesDir, `t${testCounter++}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  // Write tsconfig for this test directory
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2020',
      module: 'ES2022',
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      noEmit: true,
      strict: true,
    },
    include: ['./**/*.ts', './**/*.tsx'],
  }));

  return {
    dir,
    writeFixture: (name: string, content: string) => _writeFixture(dir, name, content),
  };
}

function createLinter() {
  return new Linter({ configType: 'flat' });
}

function getLinterConfig(tsconfigRootDir: string): Linter.Config[] {
  return [
    // @ts-expect-error - typescript-eslint flat configs work at runtime
    ...tseslint.configs.recommended,
    {
      languageOptions: {
        parserOptions: {
          project: './tsconfig.json',
          tsconfigRootDir,
        },
      },
    },
    {
      plugins: {
        'css-modules': plugin as any,
      },
      rules: {
        'css-modules/undefined-class': 'error',
        'css-modules/unused-class': 'warn',
      },
    },
  ];
}

describe('eslint-plugin', () => {
  describe('plugin structure', () => {
    it('exports rules', () => {
      expect(plugin.rules).toHaveProperty('undefined-class');
      expect(plugin.rules).toHaveProperty('unused-class');
    });

    it('exports recommended config', () => {
      expect(plugin.configs.recommended).toBeDefined();
      expect(plugin.configs.recommended.rules).toEqual({
        'css-modules/undefined-class': 'error',
        'css-modules/unused-class': 'warn',
      });
      expect(plugin.configs.recommended.languageOptions).toEqual({
        parserOptions: { projectService: true },
      });
    });

    it('has correct rule meta', () => {
      expect(plugin.rules['undefined-class'].meta?.type).toBe('problem');
      expect(plugin.rules['unused-class'].meta?.type).toBe('suggestion');
    });
  });

  describe('undefined-class rule', () => {
    it('reports undefined class access', () => {
      const { dir, writeFixture } = setupTestDir();
      writeFixture('undef.module.scss', `.container { display: flex; }`);
      const tsFile = writeFixture('undef.tsx', [
        `import styles from './undef.module.scss';`,
        `const x = styles.container;`,
        `const y = styles.nonExistent;`,
      ].join('\n'));

      const linter = createLinter();
      const code = fs.readFileSync(tsFile, 'utf-8');
      const messages = linter.verify(code, getLinterConfig(dir), { filename: tsFile });

      const errors = messages.filter(m => m.ruleId === 'css-modules/undefined-class');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('nonExistent');
      expect(errors[0].severity).toBe(2); // error
    });

    it('does not report defined class access', () => {
      const { dir, writeFixture } = setupTestDir();
      writeFixture('defined.module.scss', `.container { display: flex; }\n.header { color: red; }`);
      const tsFile = writeFixture('defined.tsx', [
        `import styles from './defined.module.scss';`,
        `const x = styles.container;`,
        `const y = styles.header;`,
      ].join('\n'));

      const linter = createLinter();
      const code = fs.readFileSync(tsFile, 'utf-8');
      const messages = linter.verify(code, getLinterConfig(dir), { filename: tsFile });

      const errors = messages.filter(m => m.ruleId === 'css-modules/undefined-class');
      expect(errors).toHaveLength(0);
    });

    it('returns no errors for files without CSS module imports', () => {
      const { dir, writeFixture } = setupTestDir();
      const tsFile = writeFixture('no-css.tsx', [
        `const x = 'hello';`,
        `export default x;`,
      ].join('\n'));

      const linter = createLinter();
      const code = fs.readFileSync(tsFile, 'utf-8');
      const messages = linter.verify(code, getLinterConfig(dir), { filename: tsFile });

      const errors = messages.filter(m => m.ruleId === 'css-modules/undefined-class');
      expect(errors).toHaveLength(0);
    });
  });

  describe('unused-class rule', () => {
    it('reports unused classes', () => {
      const { dir, writeFixture } = setupTestDir();
      writeFixture('unused.module.scss', `.used { display: flex; }\n.unused { color: red; }`);
      const tsFile = writeFixture('unused.tsx', [
        `import styles from './unused.module.scss';`,
        `const x = styles.used;`,
      ].join('\n'));

      const linter = createLinter();
      const code = fs.readFileSync(tsFile, 'utf-8');
      const messages = linter.verify(code, getLinterConfig(dir), { filename: tsFile });

      const warnings = messages.filter(m => m.ruleId === 'css-modules/unused-class');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('unused');
      expect(warnings[0].severity).toBe(1); // warning
    });

    it('does not report when all classes are used', () => {
      const { dir, writeFixture } = setupTestDir();
      writeFixture('all-used.module.scss', `.foo { display: flex; }\n.bar { color: red; }`);
      const tsFile = writeFixture('all-used.tsx', [
        `import styles from './all-used.module.scss';`,
        `const x = styles.foo;`,
        `const y = styles.bar;`,
      ].join('\n'));

      const linter = createLinter();
      const code = fs.readFileSync(tsFile, 'utf-8');
      const messages = linter.verify(code, getLinterConfig(dir), { filename: tsFile });

      const warnings = messages.filter(m => m.ruleId === 'css-modules/unused-class');
      expect(warnings).toHaveLength(0);
    });
  });

  describe('no program available', () => {
    it('warns when parserServices has no program', () => {
      const { dir, writeFixture } = setupTestDir();
      writeFixture('no-prog.module.scss', `.container { display: flex; }`);
      const tsFile = writeFixture('no-prog.tsx', [
        `import styles from './no-prog.module.scss';`,
        `const x = styles.nonExistent;`,
      ].join('\n'));

      // Use linter without typescript-eslint parser (no program)
      const linter = createLinter();
      const code = fs.readFileSync(tsFile, 'utf-8');
      const config: Linter.Config[] = [
        {
          files: ['**/*.{ts,tsx}'],
          plugins: {
            'css-modules': plugin as any,
          },
          rules: {
            'css-modules/undefined-class': 'error',
            'css-modules/unused-class': 'warn',
          },
        },
      ];
      const messages = linter.verify(code, config, { filename: tsFile });

      const cssModuleMessages = messages.filter(m => m.ruleId?.startsWith('css-modules/'));
      expect(cssModuleMessages).toHaveLength(2);
      expect(cssModuleMessages.every(m =>
        m.message.includes('projectService')
      )).toBe(true);
    });
  });
});
