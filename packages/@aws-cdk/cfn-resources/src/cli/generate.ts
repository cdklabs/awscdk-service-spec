import path from 'path';
import { DatabaseSchema } from '@aws-cdk/service-spec';
import { Database } from '@cdklabs/tskb';
import { TypeScriptRenderer } from '@cdklabs/typewriter';
import * as fs from 'fs-extra';
import { AstBuilder } from './cdk/ast';
import { ModuleImportLocations } from './cdk/cdk';
import { loadDatabase } from './db';
import { debug } from './log';

export interface GenerateOptions {
  /**
   * Location of the generated files
   */
  readonly outputPath: string;
  /**
   * Should the location be deleted before generating new files
   * @default false
   */
  readonly clearOutput?: boolean;
  /**
   * The pattern used to name files.
   */
  readonly filePattern: string;
  /**
   * Output debug messages
   * @default false
   */
  readonly debug?: boolean;
  /**
   * The services to generate files for.
   */
  readonly services?: string[];
  /**
   * Override the locations modules are imported from
   */
  readonly importLocations?: ModuleImportLocations;
}

export async function generate(options: GenerateOptions) {
  if (options.debug) {
    process.env.DEBUG = '1';
  }
  debug('Options', options);
  const { outputPath, filePattern, clearOutput, importLocations: importNames } = options;

  const db = await loadDatabase();
  const renderer = new TypeScriptRenderer();

  let resourceCount = 0;
  const services = getServices(db, options.services).map((s) => {
    debug(s.name, 'ast');
    const ast = AstBuilder.forService(s, { db, importLocations: importNames });
    resourceCount += db.follow('hasResource', s).length;
    return ast.scope;
  });

  console.log('Generating %i Resources for %i Services', resourceCount, services.length);

  if (clearOutput) {
    fs.removeSync(outputPath);
  }

  for (const s of services) {
    debug(`${s.service}`, 'render');

    const filePath = path.join(
      outputPath,
      replacePattern(filePattern, {
        package: s.name.toLowerCase(),
        service: s.service.toLowerCase(),
        shortname: s.shortName.toLowerCase(),
      }),
    );

    fs.outputFileSync(filePath, renderer.render(s));
  }
}

function getServices(db: Database<DatabaseSchema>, services?: string[]) {
  if (!services) {
    return db.all('service');
  }

  return services.flatMap((name) => db.lookup('service', 'name', 'equals', name));
}

function replacePattern(pattern: string, data: Record<string, string>) {
  return Object.keys(data).reduce((target, k) => target.replace(`%${k}%`, data[k]), pattern);
}
