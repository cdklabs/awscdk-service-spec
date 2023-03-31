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
    cannedMetricsFilePattern: ({ shortname }) => `${shortname}-canned-metrics.generated.ts`,
    outputPath: outPath ?? 'lib',
    clearOutput: false,
    services: scopes.map(scopeToServiceName),
    serviceSuffixes: computeServiceSuffixes(scopes),
    importLocations: {
      core: coreImport,
      coreHelpers: `${coreImport}/${coreImport === '.' ? '' : 'lib/'}helpers-internal`,
    },
  });
}

/**
 * Convert a CFN style service scope to a service name
 *
 * @example "AWS::DynamoDB" -> "aws-dynamodb"
 */
function scopeToServiceName(scope: string): string {
  return scope.replace('::', '-').toLowerCase();
}

/**
 * Maps suffixes to services used to generated class names, given all the scopes that share the same package.
 */
function computeServiceSuffixes(scopes: string[] = []): Record<string, string> {
  return scopes.reduce(
    (suffixes, scope) => ({
      ...suffixes,
      [scopeToServiceName(scope)]: computeSuffix(scope, scopes),
    }),
    {},
  );
}

/**
 * Finds a suffix for class names generated for a scope, given all the scopes that share the same package.
 * @param scope     the scope for which an affix is needed (e.g: AWS::ApiGatewayV2)
 * @param allScopes all the scopes hosted in the package (e.g: ["AWS::ApiGateway", "AWS::ApiGatewayV2"])
 * @returns the affix (e.g: "V2"), if any, or undefined.
 */
function computeSuffix(scope: string, allScopes: string[]): string | undefined {
  if (allScopes.length === 1) {
    return undefined;
  }
  const parts = scope.match(/^(.+)(V\d+)$/);
  if (!parts) {
    return undefined;
  }
  const [, root, version] = parts;
  if (allScopes.indexOf(root) !== -1) {
    return version;
  }
  return undefined;
}
