import * as path from 'path';
import { generate as generateModules } from '@aws-cdk/cfn-resources';
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
    scopes = await getAllScopes('cloudFormationNamespace');
  } else if (typeof scopes === 'string') {
    scopes = [scopes];
  }

  console.log(`cfn-resources: ${scopes.join(', ')}`);
  const generated = await generateModules(
    {
      'aws-cdk-lib': {
        services: scopes,
        serviceSuffixes: computeServiceSuffixes(scopes),
      },
    },
    {
      outputPath: outPath ?? 'lib',
      clearOutput: false,
      filePatterns: {
        resources: ({ serviceShortName }) => `${serviceShortName}.generated.ts`,
        augmentations: ({ serviceShortName }) => `${serviceShortName}-augmentations.generated.ts`,
        cannedMetrics: ({ serviceShortName }) => `${serviceShortName}-canned-metrics.generated.ts`,
      },
      importLocations: {
        core: coreImport,
        coreHelpers: `${coreImport}/${coreImport === '.' ? '' : 'lib/'}helpers-internal`,
      },
    },
  );

  return generated;
}

/**
 * Maps suffixes to services used to generated class names, given all the scopes that share the same package.
 */
function computeServiceSuffixes(scopes: string[] = []): Record<string, string> {
  return scopes.reduce(
    (suffixes, scope) => ({
      ...suffixes,
      [scope]: computeSuffix(scope, scopes),
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
    const moduleDefinition = pkglint.createModuleDefinitionFromCfnNamespace(scope);
    const currentScopes = moduleMap[moduleDefinition.moduleName]?.scopes ?? [];
    // remove dupes
    const newScopes = [...new Set([...currentScopes, scope])];

    // Add new modules to module map and return to caller
    moduleMap[moduleDefinition.moduleName] = {
      scopes: newScopes,
      module: moduleDefinition,
      resources: {},
    };
  }

  const coreModule = 'core';
  const coreImportLocations = {
    core: '.',
    coreHelpers: `./helpers-internal`,
  };

  const generated = await generateModules(
    Object.fromEntries(
      Object.entries(moduleMap).map(([moduleName, { scopes: services }]) => [
        moduleName,
        {
          services,
          serviceSuffixes: computeServiceSuffixes(services),
          moduleImportLocations: moduleName === coreModule ? coreImportLocations : undefined,
        },
      ]),
    ),
    {
      outputPath: outPath,
      clearOutput: false,
      filePatterns: {
        resources: ({ moduleName: m, serviceShortName: s }) => `${m}/lib/${s}.generated.ts`,
        augmentations: ({ moduleName: m, serviceShortName: s }) => `${m}/lib/${s}-augmentations.generated.ts`,
        cannedMetrics: ({ moduleName: m, serviceShortName: s }) => `${m}/lib/${s}-canned-metrics.generated.ts`,
      },
      importLocations: {
        core: options.coreImport,
        coreHelpers: `${options.coreImport}/lib/helpers-internal`,
      },
    },
  );

  Object.entries(moduleMap).map(async ([moduleName, { module: moduleDefinition }]) => {
    // Add generated resources to module in map
    moduleMap[moduleName].resources = generated.modules[moduleName].map((m) => m.resources).reduce(mergeObjects);

    // core doesn't need a jsiirc file
    if (moduleName === 'core') {
      return;
    }

    // Create .jsiirc.json file if needed
    const packagePath = path.join(outPath, moduleName);
    if (!fs.existsSync(path.join(packagePath, '.jsiirc.json'))) {
      if (!moduleDefinition) {
        throw new Error(
          `Cannot infer path or namespace for submodule named "${moduleName}". Manually create ${packagePath}/.jsiirc.json file.`,
        );
      }

      const jsiirc = {
        targets: {
          java: {
            package: moduleDefinition.javaPackage,
          },
          dotnet: {
            package: moduleDefinition.dotnetPackage,
          },
          python: {
            module: moduleDefinition.pythonModuleName,
          },
        },
      };
      fs.writeJsonSync(path.join(packagePath, '.jsiirc.json'), jsiirc, { spaces: 2 });
    }
  });

  return moduleMap;
}

/**
 * Reads the scope map from a file and transforms it into the type we need.
 */
async function readScopeMap(filepath: string): Promise<ModuleMap> {
  const scopeMap: Record<string, string[]> = await fs.readJson(filepath);
  return Object.entries(scopeMap).reduce((accum, [name, moduleScopes]) => {
    return {
      ...accum,
      [name]: { scopes: moduleScopes },
    };
  }, {});
}

function mergeObjects<T>(all: T, res: T) {
  return {
    ...all,
    ...res,
  };
}
