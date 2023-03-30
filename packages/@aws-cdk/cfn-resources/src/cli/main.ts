import path from 'path';
import { parseArgv } from './args';
import { generate } from './generate';
import { debug } from './log';
import { parsePattern } from './naming/patterned-name';

async function main(argv: string[]) {
  const { args, options } = parseArgv(argv, ['output']);
  if (options.debug) {
    process.env.DEBUG = '1';
  }
  debug('CLI args', args, options);

  const pss = { package: true, service: true, shortname: true };

  const outputPath = args.output ?? path.join(__dirname, '..', 'services');
  const resourceFilePattern = parsePattern(
    stringOr(options.pattern, path.join('%package%', '%shortname%.generated.ts')),
    pss,
  );

  const augmentationsFilePattern = parsePattern(
    stringOr(options.augmentations, path.join('%package%', '%shortname%-augmentations.generated.ts')),
    pss,
  );

  const cannedMetricsFilePattern = parsePattern(
    stringOr(options.metrics, path.join('%package%', '%shortname%-canned-metrics.generated.ts')),
    pss,
  );

  await generate({
    outputPath,
    resourceFilePattern,
    augmentationsFilePattern,
    cannedMetricsFilePattern,
    clearOutput: !!options['clear-output'],
    augmentationsSupport: !!options['augmentations-support'],
    services: options.service ? [options.service as string] : undefined,
    debug: options.debug as boolean,
  });
}

main(process.argv.splice(2)).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

function stringOr(pat: unknown, def: string) {
  if (!pat) {
    return def;
  }
  if (typeof pat !== 'string') {
    throw new Error(`Expected string, got: ${JSON.stringify(pat)}`);
  }
  return pat;
}
