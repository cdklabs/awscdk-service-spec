import path from 'path';
import { parseArgv } from './args';
import { PatternKeys, generate, generateAll } from './generate';
import { debug } from './log';
import { parsePattern } from './naming/patterned-name';

async function main(argv: string[]) {
  const { args, options } = parseArgv(argv, ['output']);
  if (options.debug) {
    process.env.DEBUG = '1';
  }
  debug('CLI args', args, options);

  const pss: Record<PatternKeys, true> = { moduleName: true, serviceName: true, serviceShortName: true };

  const outputPath = args.output ?? path.join(__dirname, '..', 'services');
  const resourceFilePattern = parsePattern(
    stringOr(options.pattern, path.join('%moduleName%', '%serviceShortName%.generated.ts')),
    pss,
  );

  const augmentationsFilePattern = parsePattern(
    stringOr(options.augmentations, path.join('%moduleName%', '%serviceShortName%-augmentations.generated.ts')),
    pss,
  );

  const cannedMetricsFilePattern = parsePattern(
    stringOr(options.metrics, path.join('%moduleName%', '%serviceShortName%-canned-metrics.generated.ts')),
    pss,
  );

  const generatorOptions = {
    outputPath,
    filePatterns: {
      resources: resourceFilePattern,
      augmentations: augmentationsFilePattern,
      cannedMetrics: cannedMetricsFilePattern,
    },
    clearOutput: !!options['clear-output'],
    augmentationsSupport: !!options['augmentations-support'],
    debug: options.debug as boolean,
  };

  if (options.service && typeof options.service === 'string') {
    const moduleMap = { [options.service]: { services: [options.service] } };
    await generate(moduleMap, generatorOptions);
    return;
  }

  await generateAll(generatorOptions);
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
