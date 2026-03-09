#!/usr/bin/env node
import { check } from './cli-check';
import { generate } from './cli-generate';
import { init } from './cli-init';

const [,, command, ...args] = process.argv;

switch (command) {
  case 'init':
    init().catch(err => { console.error(err); process.exit(1); });
    break;
  case 'check':
    process.exit(check(args));
    break;
  case 'generate':
    generate(args);
    break;
  default:
    console.error('Usage: css-modules-lint <command> [options]');
    console.error('');
    console.error('Commands:');
    console.error('  init                         Set up plugin in tsconfig and .gitignore');
    console.error('  check                        Check for undefined/unused CSS module classes');
    console.error('  check --fix                  Remove unused classes from stylesheets');
    console.error('  check --project <path>       Use a specific tsconfig.json');
    console.error('  generate                     Generate .d.ts files for CSS modules');
    console.error('  generate --watch             Watch mode for .d.ts generation');
    process.exit(1);
}
