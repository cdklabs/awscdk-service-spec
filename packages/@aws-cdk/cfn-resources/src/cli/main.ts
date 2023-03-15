import path from 'path';
import { TypeScriptRenderer } from '@cdklabs/typewriter';
import * as fs from 'fs-extra';
import { parseArgv } from './args';
import { AstBuilder } from './cdk/ast';
import { loadDatabase } from './db';

function debug(...messages: Array<string | number | object>) {
  if (process.env.DEBUG) {
    console.debug(...messages);
  }
}

export function replacePattern(pattern: string, data: Record<string, string>) {
  return Object.keys(data).reduce((target, k) => target.replace(`%${k}%`, data[k]), pattern);
}

async function main(argv: string[]) {
  const { args, options } = parseArgv(argv, ['output']);
  if (options.debug) {
    process.env.DEBUG = '1';
  }
  debug('CLI args', args, options);

  const outputPath = args.output ?? path.join(__dirname, '..', 'services');
  const filePattern = options.pattern ?? path.join('%package%', '%shortname%.generated.ts');
  const params = ['%package%', '%service%', '%shortname%'];
  const containsParam = params.reduce((found, param) => found || filePattern.includes(param), false);
  if (!containsParam) {
    throw `Error: --pattern must contain one of [${params.join(', ')}]`;
  }

  const db = await loadDatabase();
  const renderer = new TypeScriptRenderer();

  const services = db.all('service').map((s) => {
    debug(s.name, 'ast');
    const ast = AstBuilder.forService(s, db);
    return ast.scope;
  });

  console.log('Generating %i Resources for %i Services', db.all('resource').length, db.all('service').length);

  if (options['clear-output']) {
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

main(process.argv.splice(2)).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
