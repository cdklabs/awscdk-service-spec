import { generate } from '@aws-cdk/cfn-resources';

interface CodeGeneratorOptions {
  /**
   * How to import the core library.
   *
   * @default '@aws-cdk/core'
   */
  readonly coreImport?: string;
}

export default async function (
  scopes: string | string[],
  outPath: string,
  options: CodeGeneratorOptions = {},
): Promise<void> {
  const coreImport = options.coreImport ?? '@aws-cdk/core';
  if (typeof scopes === 'string') {
    scopes = [scopes];
  }

  console.log(`cfn-resources: ${scopes.join(', ')}`);
  await generate({
    resourceFilePattern: ({ shortname }) => `${shortname}.generated.ts`,
    augmentationsFilePattern: ({ shortname }) => `${shortname}-augmentations.generated.ts`,
    outputPath: outPath ?? 'lib',
    clearOutput: false,
    services: scopes.map((s) => s.replace('::', '-').toLowerCase()),
    importLocations: {
      core: coreImport,
      coreHelpers: `${coreImport}/${coreImport === '.' ? '' : 'lib/'}helpers-internal`,
    },
  });
}
