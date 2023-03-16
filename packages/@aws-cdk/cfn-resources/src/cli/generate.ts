import path from 'path';
import { TypeScriptRenderer } from '@cdklabs/typewriter';
import * as fs from 'fs-extra';
import { AstBuilder } from './cdk/ast';
import { loadDatabase } from './db';
import { debug } from './log';
import { Database } from '@cdklabs/tskb';
import { DatabaseSchema } from '@aws-cdk/service-spec';

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
}

export async function generate(options: GenerateOptions) {
  if (options.debug) {
    process.env.DEBUG = '1';
  }
  debug('Options', options);
  const { outputPath, filePattern, clearOutput } = options;

  const db = await loadDatabase();
  const renderer = new TypeScriptRenderer();

  const services = getServices(db, options.services).map((s) => {
    debug(s.name, 'ast');
    const ast = AstBuilder.forService(s, db);
    return ast.scope;
  });

  console.log('Generating %i Resources for %i Services', db.all('resource').length, db.all('service').length);

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
