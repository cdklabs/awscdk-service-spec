import * as pj from 'projen';
import { yarn } from 'cdklabs-projen-project-types';

const lfsPatterns = ['sources/**/*.json'];

const repo = new yarn.CdkLabsMonorepo({
  name: 'awscdk-service-spec',
  description: "Monorepo for the AWS CDK's service spec",

  defaultReleaseBranch: 'main',
  devDeps: ['cdklabs-projen-project-types'],
  vscodeWorkspace: true,

  prettier: true,
  prettierOptions: {
    settings: {
      printWidth: 120,
      singleQuote: true,
      trailingComma: pj.javascript.TrailingComma.ALL,
    },
  },

  gitignore: ['.DS_Store'],
  gitOptions: {
    lfsPatterns,
  },
});

// Hide generated config files in VSCode
repo.vscode?.settings.addSettings({
  'files.exclude': {
    '**/.projen': true,
    '**/.eslintrc.js': true,
    '**/.eslintrc.json': true,
    '**/.gitattributes': true,
    '**/.gitignore': true,
    '**/.npmignore': true,
    '**/*.tsbuildinfo': true,
    '**/node_modules': true,
    '**/coverage': true,
    '**/dist': true,
    '**/lib': true,
    '**/test-reports': true,
    '.prettierignore': true,
    '.prettierrc.json': true,
    '**/tsconfig.json': true,
    '**/tsconfig.dev.json': true,
    'awscdk-service-spec.code-workspace': true,
  },
});

// Tell GitHub to hide these files from diffs and not count the lines by default
for (const lfsPattern of lfsPatterns) {
  repo.gitattributes.addAttributes(lfsPattern, 'linguist-generated=true');
}

const tsKb = new yarn.TypeScriptWorkspace({
  parent: repo,
  name: '@cdklabs/tskb',
  description: 'Using TypeScript as a knowledge base',
});
tsKb.synth();

const typewriter = new yarn.TypeScriptWorkspace({
  parent: repo,
  name: '@cdklabs/typewriter',
  description: 'Write typed code for jsii',
  deps: [
    '@jsii/spec',
    'camelcase@^6', // camelcase 7 uses ESM
  ],
});
typewriter.synth();

const serviceSpecSources = new yarn.TypeScriptWorkspace({
  parent: repo,
  name: '@aws-cdk/service-spec-sources',
  description: 'Sources for the service spec',
  deps: ['ajv', 'glob', tsKb, 'fast-json-patch', 'canonicalize'],
  devDeps: ['ts-json-schema-generator', '@types/glob', 'ajv-cli'],
  private: true,
});
for (const tsconfig of [serviceSpecSources.tsconfig, serviceSpecSources.tsconfigDev]) {
  tsconfig?.addInclude('src/**/*.json');
}

const serviceSpecSchemaTask = serviceSpecSources.addTask('gen-schemas', {
  steps: [
    'CloudFormationRegistryResource',
    'ResourceSpecification',
    'CloudFormationDocumentation',
    'StatefulResources',
  ].map((typeName: string) => ({
    exec: [
      'ts-json-schema-generator',
      '--tsconfig',
      'tsconfig.json',
      '--type',
      typeName,
      '--out',
      `schemas/${typeName}.schema.json`,
    ].join(' '),
  })),
});

// FIXME: Needs to automatically run, but not yet because not everything validates yet
serviceSpecSources.addTask('validate-specs', {
  steps: [{ exec: 'node ./lib/build-tools/validate-resources.js' }],
});

serviceSpecSources.compileTask.prependSpawn(serviceSpecSchemaTask);
serviceSpecSources.synth();

const serviceSpec = new yarn.TypeScriptWorkspace({
  parent: repo,
  name: '@aws-cdk/service-spec',
  description: 'AWS CDK Service spec',
  deps: [tsKb],
});
serviceSpec.synth();

const serviceSpecBuild = new yarn.TypeScriptWorkspace({
  parent: repo,
  name: '@aws-cdk/service-spec-build',
  description: 'Build the service spec from service-spec-sources to service-spec',
  deps: [tsKb, serviceSpecSources, serviceSpec],
  devDeps: ['source-map-support'],
  private: true,
});
const buildDb = serviceSpecBuild.tasks.addTask('build:db', {
  exec: 'node -r source-map-support/register lib/cli/build',
});
serviceSpecBuild.postCompileTask.spawn(buildDb);
serviceSpecBuild.gitignore.addPatterns('db.json');
serviceSpecBuild.synth();

const cfnResources = new yarn.TypeScriptWorkspace({
  parent: repo,
  name: '@aws-cdk/cfn-resources',
  description: 'L1 constructs for all CloudFormation Resources',
  deps: ['aws-cdk-lib@^2'],
  peerDeps: ['constructs@^10.0.0'],
  devDeps: [
    typewriter,
    serviceSpec,
    serviceSpecBuild,
    tsKb,
    'camelcase',
    'ts-node',
    '@jsii/spec',
    'fs-extra',
    '@types/fs-extra@^9',
    '@swc/core',
    'aws-cdk-lib',
  ],
});
cfnResources.eslint?.addOverride({
  files: ['src/cli/**/*.ts', 'test/**/*.ts'],
  rules: {
    'import/no-extraneous-dependencies': 'off',
  },
});
cfnResources.addGitIgnore('src/services/**');
cfnResources.tsconfigDev.file.addOverride('ts-node.swc', true);
cfnResources.preCompileTask.spawn(
  cfnResources.tasks.addTask('generate', {
    exec: 'ts-node --project tsconfig.dev.json src/cli/main.ts',
    receiveArgs: true,
  }),
);
cfnResources.synth();

repo.synth();
