import fs from 'fs';
import { parseStyleFile, ParsedStyleFile } from './css-parser';

interface StyleFileEntry {
  parsed: ParsedStyleFile;
  mtime: number;
  /** Map of TS file path → set of class names used from this style file */
  usedBy: Map<string, Set<string>>;
}

export class UsageTracker {
  private registry = new Map<string, StyleFileEntry>();

  /**
   * Get or parse a style file, using cache if the file hasn't changed.
   */
  getStyleFile(scssFile: string): ParsedStyleFile | null {
    const entry = this.registry.get(scssFile);

    let mtime: number;
    try {
      mtime = fs.statSync(scssFile).mtimeMs;
    } catch {
      return null;
    }

    if (entry && entry.mtime === mtime) {
      return entry.parsed;
    }

    const parsed = parseStyleFile(scssFile);
    if (!parsed) return null;

    // Preserve existing usedBy map if re-parsing same file
    const usedBy = entry?.usedBy ?? new Map<string, Set<string>>();

    this.registry.set(scssFile, { parsed, mtime, usedBy });
    return parsed;
  }

  /**
   * Register which classes a TS file uses from a style file.
   */
  registerUsage(tsFile: string, scssFile: string, usedClasses: Set<string>): void {
    const entry = this.registry.get(scssFile);
    if (!entry) return;
    entry.usedBy.set(tsFile, usedClasses);
  }

  /**
   * Clear all usage data for a TS file (call before re-analyzing it).
   */
  invalidateFile(tsFile: string): void {
    for (const entry of this.registry.values()) {
      entry.usedBy.delete(tsFile);
    }
  }

  /**
   * Clear cached data for a style file (call when the SCSS file changes).
   */
  invalidateStyleFile(scssFile: string): void {
    this.registry.delete(scssFile);
  }

  /**
   * Get classes that are defined in the style file but not used by ANY importing TS file.
   */
  getUnusedClasses(scssFile: string): string[] {
    const entry = this.registry.get(scssFile);
    if (!entry) return [];

    const allUsed = new Set<string>();
    for (const usedClasses of entry.usedBy.values()) {
      for (const cls of usedClasses) {
        allUsed.add(cls);
      }
    }

    return Object.keys(entry.parsed.classes).filter(
      (cls) => !allUsed.has(cls) && entry.parsed.classes[cls] !== true
    );
  }

  /**
   * Get classes used in a TS file that don't exist in the style file.
   */
  getUndefinedClasses(scssFile: string, usedClasses: Set<string>): string[] {
    const entry = this.registry.get(scssFile);
    if (!entry) return [];

    const availableClasses = new Set([
      ...Object.keys(entry.parsed.classes),
      ...Object.keys(entry.parsed.exportProps),
    ]);

    return [...usedClasses].filter((cls) => !availableClasses.has(cls));
  }

  /**
   * Get all style files tracked by the registry.
   */
  getTrackedStyleFiles(): string[] {
    return [...this.registry.keys()];
  }

  /**
   * Merge another tracker's registry into this one.
   */
  merge(other: UsageTracker): void {
    for (const [scssFile, otherEntry] of other.registry) {
      const existing = this.registry.get(scssFile);
      if (!existing) {
        this.registry.set(scssFile, otherEntry);
      } else {
        for (const [tsFile, classes] of otherEntry.usedBy) {
          existing.usedBy.set(tsFile, classes);
        }
      }
    }
  }
}
