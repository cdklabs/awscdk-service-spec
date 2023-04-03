import * as path from 'path';
import { generate as generateNew } from '@aws-cdk/cfn-resources';
import { loadDatabase } from '@aws-cdk/cfn-resources/src/cli/db';
import { Service } from '@aws-cdk/service-spec';
import * as fs from 'fs-extra';
import * as pkglint from './pkglint';
import { CodeGeneratorOptions, GenerateAllOptions, ModuleMap } from './types';

export * from './types';

interface GenerateOutput {
  outputFiles: string[];
  resources: Record<string, string>;
}

let serviceCache: Service[];

async function getAllScopes(field: keyof Service = 'name') {
  if (!serviceCache) {
    const db = await loadDatabase();
    serviceCache = db.all('service');
  }

  return serviceCache.map((s) => s[field]);
}

export default async function generate(
  scopes: string | string[],
  outPath: string,
  options: CodeGeneratorOptions = {},
): Promise<GenerateOutput> {
  const coreImport = options.coreImport ?? 'aws-cdk-lib';
  if (scopes === '*') {
    scopes = await getAllScopes();
  } else if (typeof scopes === 'string') {
    scopes = [scopes];
  }

  console.log(`cfn-resources: ${scopes.join(', ')}`);
  return generateNew({
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

/**
 * Generates L1s for all submodules of a monomodule. Modules to generate are
 * chosen based on the contents of the `scopeMapPath` file. This is intended for
 * use in generated L1s in aws-cdk-lib.
 * @param outPath The root directory to generate L1s in
 * @param param1  Options
 * @returns       A ModuleMap containing the ModuleDefinition and CFN scopes for each generated module.
 */
export async function generateAll(
  outPath: string,
  { scopeMapPath, ...options }: GenerateAllOptions,
): Promise<ModuleMap> {
  const scopes = await getAllScopes('cloudFormationNamespace');
  const moduleMap = await readScopeMap(scopeMapPath);

  // Make sure all scopes have their own dedicated package/namespace.
  // Adds new submodules for new namespaces.
  for (const scope of scopes) {
    const module = pkglint.createModuleDefinitionFromCfnNamespace(scope);
    const currentScopes = moduleMap[module.moduleName]?.scopes ?? [];
    // remove dupes
    const newScopes = [...new Set([...currentScopes, scope])];

    // Add new modules to module map and return to caller
    moduleMap[module.moduleName] = {
      scopes: newScopes,
      module,
      resources: {},
    };
  }

  await Promise.all(
    Object.entries(moduleMap).map(async ([moduleName, { scopes: moduleScopes, module }]) => {
      const packagePath = path.join(outPath, moduleName);
      const sourcePath = path.join(packagePath, 'lib');

      const isCore = moduleName === 'core';
      const { outputFiles, resources } = await generate(moduleScopes, sourcePath, {
        ...options,
        coreImport: isCore ? '.' : options.coreImport,
      });

      if (!fs.existsSync(path.join(packagePath, 'index.ts'))) {
        let lines = moduleScopes.map((s: string) => `// ${s} Cloudformation Resources`);
        lines.push(...outputFiles.map((f) => `export * from './lib/${f.replace('.ts', '')}'`));

        await fs.writeFile(path.join(packagePath, 'index.ts'), lines.join('\n') + '\n');
      }

      // Create .jsiirc.json file if needed
      if (!fs.existsSync(path.join(packagePath, '.jsiirc.json')) && !isCore) {
        if (!module) {
          throw new Error(
            `Cannot infer path or namespace for submodule named "${moduleName}". Manually create ${packagePath}/.jsiirc.json file.`,
          );
        }

        const jsiirc = {
          targets: {
            java: {
              package: module.javaPackage,
            },
            dotnet: {
              package: module.dotnetPackage,
            },
            python: {
              module: module.pythonModuleName,
            },
          },
        };
        await fs.writeJson(path.join(packagePath, '.jsiirc.json'), jsiirc, { spaces: 2 });
      }

      // Add generated resources to module in map
      moduleMap[moduleName].resources = resources;
    }),
  );

  return moduleMap;
}

/**
 * Reads the scope map from a file and transforms it into the type we need.
 */
async function readScopeMap(filepath: string): Promise<ModuleMap> {
  fs.existsSync;
  const scopeMap: Record<string, string[]> = await fs.readJson(filepath);
  return Object.entries(scopeMap).reduce((accum, [name, moduleScopes]) => {
    return {
      ...accum,
      [name]: { scopes: moduleScopes },
    };
  }, {});
}
