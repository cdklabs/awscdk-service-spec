import path from 'path';
import { parseArgv } from './args';
import { generate } from './generate';
import { debug } from './log';

async function main(argv: string[]) {
  const { args, options } = parseArgv(argv, ['output']);
  if (options.debug) {
    process.env.DEBUG = '1';
  }
  debug('CLI args', args, options);

  const outputPath = args.output ?? path.join(__dirname, '..', 'services');
  const filePattern = (options.pattern as string) ?? path.join('%package%', '%shortname%.generated.ts');
  const params = ['%package%', '%service%', '%shortname%'];
  const containsParam = params.reduce((found, param) => found || filePattern.includes(param), false);
  if (!containsParam) {
    throw `Error: --pattern must contain one of [${params.join(', ')}]`;
  }

  await generate({
    outputPath,
    filePattern,
    clearOutput: options['clear-output'] as boolean,
    services: options.service ? [options.service as string] : undefined,
    debug: options.debug as boolean,
  });
}

main(process.argv.splice(2)).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
