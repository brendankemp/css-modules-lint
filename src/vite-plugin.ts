import fs from 'fs';
import { writeDts, generateDts, findStyleFiles } from './cli-generate';
import { isStyleFile } from './css-parser';

// Inline Vite plugin type to avoid requiring vite as a dev dependency
interface VitePlugin {
  name: string;
  config?: (config: any) => any;
  configResolved?: (config: { command: string }) => void;
  buildStart?: () => void | Promise<void>;
  watchChange?: (id: string, change: { event: string }) => void;
}

export interface CssModulesDtsOptions {
  verbose?: boolean;
}

export default function cssModulesDts(options: CssModulesDtsOptions = {}): VitePlugin {
  const { verbose = false } = options;
  let command: string = 'serve';
  const log = verbose ? (msg: string) => console.log(`[css-modules-dts] ${msg}`) : () => {};

  return {
    name: 'css-modules-dts',

    config(userConfig) {
      const userGetJSON = userConfig?.css?.modules?.getJSON;

      return {
        css: {
          modules: {
            getJSON(cssFileName: string, json: Record<string, string>, _outputFileName: string) {
              if (userGetJSON) {
                userGetJSON(cssFileName, json, _outputFileName);
              }
              if (isStyleFile(cssFileName)) {
                if (writeDts(cssFileName, Object.keys(json))) {
                  log(`Updated ${cssFileName}.d.ts`);
                }
              }
            },
          },
        },
      };
    },

    configResolved(config) {
      command = config.command;
    },

    buildStart() {
      // In dev mode, Vite processes CSS on-demand so getJSON won't fire at startup.
      // Generate all .d.ts files upfront so editors have types immediately.
      if (command === 'serve') {
        setImmediate(() => {
          const styleFiles = findStyleFiles(process.cwd());
          let generated = 0;
          for (const file of styleFiles) {
            if (generateDts(file)) generated++;
          }
          if (generated > 0) {
            log(`Generated ${generated} .d.ts file${generated !== 1 ? 's' : ''}`);
          }
        });
      }
      // In build mode, getJSON handles .d.ts generation during CSS processing.
    },

    watchChange(id, { event }) {
      if (!isStyleFile(id)) return;

      if (event === 'delete') {
        const dtsPath = id + '.d.ts';
        try {
          fs.unlinkSync(dtsPath);
          log(`Removed ${dtsPath}`);
        } catch {
          // .d.ts already gone — nothing to do
        }
      }
    },
  };
}
