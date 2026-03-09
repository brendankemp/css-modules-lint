import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import plugin from '../src/eslint-plugin';
import { writeFixture as _writeFixture } from './test-helpers';

const fixturesDir = path.join(__dirname, 'fixtures', 'eslint');
const writeFixture = (name: string, content: string) => _writeFixture(fixturesDir, name, content);

function writeTsconfig(): string {
  const tsconfigPath = path.join(fixturesDir, 'tsconfig.json');
  fs.writeFileSync(tsconfigPath, JSON.stringify({
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
  return tsconfigPath;
}

function createLinter() {
  return new Linter({ configType: 'flat' });
}

function getLinterConfig(): Linter.Config[] {
  return [
    // @ts-expect-error - typescript-eslint flat configs work at runtime
    ...tseslint.configs.recommended,
    {
      languageOptions: {
        parserOptions: {
          project: './tsconfig.json',
          tsconfigRootDir: fixturesDir,
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
  beforeEach(() => {
    fs.rmSync(fixturesDir, { recursive: true, force: true });
    fs.mkdirSync(fixturesDir, { recursive: true });
    writeTsconfig();
  });

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
    });

    it('has correct rule meta', () => {
      expect(plugin.rules['undefined-class'].meta?.type).toBe('problem');
      expect(plugin.rules['unused-class'].meta?.type).toBe('suggestion');
    });
  });

  describe('undefined-class rule', () => {
    it('reports undefined class access', () => {
      writeFixture('undef.module.scss', `.container { display: flex; }`);
      const tsFile = writeFixture('undef.tsx', [
        `import styles from './undef.module.scss';`,
        `const x = styles.container;`,
        `const y = styles.nonExistent;`,
      ].join('\n'));

      const linter = createLinter();
      const code = fs.readFileSync(tsFile, 'utf-8');
      const messages = linter.verify(code, getLinterConfig(), { filename: tsFile });

      const errors = messages.filter(m => m.ruleId === 'css-modules/undefined-class');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('nonExistent');
      expect(errors[0].severity).toBe(2); // error
    });

    it('does not report defined class access', () => {
      writeFixture('defined.module.scss', `.container { display: flex; }\n.header { color: red; }`);
      const tsFile = writeFixture('defined.tsx', [
        `import styles from './defined.module.scss';`,
        `const x = styles.container;`,
        `const y = styles.header;`,
      ].join('\n'));

      const linter = createLinter();
      const code = fs.readFileSync(tsFile, 'utf-8');
      const messages = linter.verify(code, getLinterConfig(), { filename: tsFile });

      const errors = messages.filter(m => m.ruleId === 'css-modules/undefined-class');
      expect(errors).toHaveLength(0);
    });

    it('returns no errors for files without CSS module imports', () => {
      const tsFile = writeFixture('no-css.tsx', [
        `const x = 'hello';`,
        `export default x;`,
      ].join('\n'));

      const linter = createLinter();
      const code = fs.readFileSync(tsFile, 'utf-8');
      const messages = linter.verify(code, getLinterConfig(), { filename: tsFile });

      const errors = messages.filter(m => m.ruleId === 'css-modules/undefined-class');
      expect(errors).toHaveLength(0);
    });
  });

  describe('unused-class rule', () => {
    it('reports unused classes', () => {
      writeFixture('unused.module.scss', `.used { display: flex; }\n.unused { color: red; }`);
      const tsFile = writeFixture('unused.tsx', [
        `import styles from './unused.module.scss';`,
        `const x = styles.used;`,
      ].join('\n'));

      const linter = createLinter();
      const code = fs.readFileSync(tsFile, 'utf-8');
      const messages = linter.verify(code, getLinterConfig(), { filename: tsFile });

      const warnings = messages.filter(m => m.ruleId === 'css-modules/unused-class');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('unused');
      expect(warnings[0].severity).toBe(1); // warning
    });

    it('does not report when all classes are used', () => {
      writeFixture('all-used.module.scss', `.foo { display: flex; }\n.bar { color: red; }`);
      const tsFile = writeFixture('all-used.tsx', [
        `import styles from './all-used.module.scss';`,
        `const x = styles.foo;`,
        `const y = styles.bar;`,
      ].join('\n'));

      const linter = createLinter();
      const code = fs.readFileSync(tsFile, 'utf-8');
      const messages = linter.verify(code, getLinterConfig(), { filename: tsFile });

      const warnings = messages.filter(m => m.ruleId === 'css-modules/unused-class');
      expect(warnings).toHaveLength(0);
    });
  });

  describe('no program available', () => {
    it('warns when parserServices has no program', () => {
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
