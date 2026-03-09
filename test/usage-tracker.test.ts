import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { UsageTracker } from '../src/usage-tracker';
import { writeFixture as _writeFixture } from './test-helpers';

const fixturesDir = path.join(__dirname, 'fixtures');
const writeFixture = (name: string, content: string) => _writeFixture(fixturesDir, name, content);

describe('UsageTracker', () => {
  let tracker: UsageTracker;
  let scssFile: string;

  beforeEach(() => {
    tracker = new UsageTracker();
    scssFile = writeFixture('tracker-test.module.scss', `
      .container { display: flex; }
      .header { font-size: 20px; }
      .footer { margin-top: 10px; }
      .sidebar { width: 200px; }
    `);
  });

  describe('getStyleFile', () => {
    it('parses and caches a style file', () => {
      const result = tracker.getStyleFile(scssFile);
      expect(result).not.toBeNull();
      expect(Object.keys(result!.classes)).toContain('container');
    });

    it('returns cached result on second call', () => {
      const first = tracker.getStyleFile(scssFile);
      const second = tracker.getStyleFile(scssFile);
      expect(first).toBe(second); // same reference = cached
    });

    it('returns null for non-existent file', () => {
      const result = tracker.getStyleFile('/does/not/exist.module.scss');
      expect(result).toBeNull();
    });
  });

  describe('cross-file unused class detection', () => {
    it('reports all classes as unused when no TS files use them', () => {
      tracker.getStyleFile(scssFile);
      const unused = tracker.getUnusedClasses(scssFile);
      expect(unused).toContain('container');
      expect(unused).toContain('header');
      expect(unused).toContain('footer');
      expect(unused).toContain('sidebar');
    });

    it('does not report classes used by one file', () => {
      tracker.getStyleFile(scssFile);
      tracker.registerUsage('file1.tsx', scssFile, new Set(['container', 'header']));
      const unused = tracker.getUnusedClasses(scssFile);
      expect(unused).not.toContain('container');
      expect(unused).not.toContain('header');
      expect(unused).toContain('footer');
      expect(unused).toContain('sidebar');
    });

    it('combines usage across multiple files', () => {
      tracker.getStyleFile(scssFile);
      tracker.registerUsage('file1.tsx', scssFile, new Set(['container', 'header']));
      tracker.registerUsage('file2.tsx', scssFile, new Set(['footer', 'sidebar']));
      const unused = tracker.getUnusedClasses(scssFile);
      expect(unused).toEqual([]);
    });

    it('handles partial overlap between files', () => {
      tracker.getStyleFile(scssFile);
      tracker.registerUsage('file1.tsx', scssFile, new Set(['container']));
      tracker.registerUsage('file2.tsx', scssFile, new Set(['container', 'header']));
      const unused = tracker.getUnusedClasses(scssFile);
      expect(unused).not.toContain('container');
      expect(unused).not.toContain('header');
      expect(unused).toContain('footer');
      expect(unused).toContain('sidebar');
    });
  });

  describe('undefined class detection', () => {
    it('reports classes not in the style file', () => {
      tracker.getStyleFile(scssFile);
      const undefined_ = tracker.getUndefinedClasses(scssFile, new Set(['container', 'nonExistent']));
      expect(undefined_).toContain('nonExistent');
      expect(undefined_).not.toContain('container');
    });

    it('returns empty when all classes exist', () => {
      tracker.getStyleFile(scssFile);
      const undefined_ = tracker.getUndefinedClasses(scssFile, new Set(['container', 'header']));
      expect(undefined_).toEqual([]);
    });
  });

  describe('getTrackedStyleFiles', () => {
    it('returns all tracked style file paths', () => {
      const otherScss = writeFixture('other.module.scss', `.btn { color: red; }`);
      tracker.getStyleFile(scssFile);
      tracker.getStyleFile(otherScss);

      const files = tracker.getTrackedStyleFiles();
      expect(files).toContain(scssFile);
      expect(files).toContain(otherScss);
      expect(files).toHaveLength(2);
    });

    it('returns empty array when no files tracked', () => {
      expect(tracker.getTrackedStyleFiles()).toEqual([]);
    });
  });

  describe('merge', () => {
    it('merges usage from another tracker', () => {
      tracker.getStyleFile(scssFile);
      tracker.registerUsage('file1.tsx', scssFile, new Set(['container']));

      const other = new UsageTracker();
      other.getStyleFile(scssFile);
      other.registerUsage('file2.tsx', scssFile, new Set(['header', 'footer']));

      tracker.merge(other);

      const unused = tracker.getUnusedClasses(scssFile);
      expect(unused).not.toContain('container');
      expect(unused).not.toContain('header');
      expect(unused).not.toContain('footer');
      expect(unused).toContain('sidebar');
    });

    it('adds new style files from the other tracker', () => {
      const otherScss = writeFixture('merge-other.module.scss', `.btn { color: red; }`);

      const other = new UsageTracker();
      other.getStyleFile(otherScss);
      other.registerUsage('file3.tsx', otherScss, new Set(['btn']));

      tracker.merge(other);

      const unused = tracker.getUnusedClasses(otherScss);
      expect(unused).toEqual([]);
    });

    it('does not overwrite existing usage when merging', () => {
      tracker.getStyleFile(scssFile);
      tracker.registerUsage('file1.tsx', scssFile, new Set(['container', 'header', 'footer', 'sidebar']));

      const other = new UsageTracker();
      other.getStyleFile(scssFile);
      // other tracker has no usage registered

      tracker.merge(other);

      const unused = tracker.getUnusedClasses(scssFile);
      expect(unused).toEqual([]);
    });
  });

  describe('invalidation', () => {
    it('clears usage when a TS file is invalidated', () => {
      tracker.getStyleFile(scssFile);
      tracker.registerUsage('file1.tsx', scssFile, new Set(['container', 'header', 'footer', 'sidebar']));
      expect(tracker.getUnusedClasses(scssFile)).toEqual([]);

      tracker.invalidateFile('file1.tsx');
      const unused = tracker.getUnusedClasses(scssFile);
      expect(unused.length).toBe(4);
    });

    it('re-parses when a style file is invalidated', () => {
      tracker.getStyleFile(scssFile);
      tracker.registerUsage('file1.tsx', scssFile, new Set(['container']));

      // Modify the file
      fs.writeFileSync(scssFile, '.newClass { color: red; }');
      tracker.invalidateStyleFile(scssFile);

      const result = tracker.getStyleFile(scssFile);
      expect(result).not.toBeNull();
      expect(Object.keys(result!.classes)).toContain('newClass');
      expect(Object.keys(result!.classes)).not.toContain('container');
    });
  });
});
