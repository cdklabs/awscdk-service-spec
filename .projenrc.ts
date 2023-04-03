import * as pj from 'projen';
import { AwsCdkIntgrationTest, TypeScriptWorkspace, YarnMonorepo } from './projenrc';

const repo = new YarnMonorepo({
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
  workflowRunsOn: ['awscdk-service-spec_ubuntu-latest_32-core'],
  gitignore: ['.DS_Store'],
  gitOptions: {
    lfsPatterns: ['sources/**/*.json'],
  },
});

const tsKb = new TypeScriptWorkspace({
  parent: repo,
  name: '@cdklabs/tskb',
  description: 'Using TypeScript as a knowledge base',
});
tsKb.synth();

const typewriter = new TypeScriptWorkspace({
  parent: repo,
  name: '@cdklabs/typewriter',
  description: 'Write typed code for jsii',
  deps: [
    '@jsii/spec',
    'camelcase@^6', // camelcase 7 uses ESM
  ],
});
typewriter.synth();

const serviceSpecSources = new TypeScriptWorkspace({
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
    'CloudFormationResourceSpecification',
    'CloudFormationDocumentation',
    'StatefulResources',
    'SamTemplateSchema',
    'CloudWatchConsoleServiceDirectory',
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

const serviceSpec = new TypeScriptWorkspace({
  parent: repo,
  name: '@aws-cdk/service-spec',
  description: 'AWS CDK Service spec',
  deps: [tsKb],
});
serviceSpec.synth();

const serviceSpecBuild = new TypeScriptWorkspace({
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
serviceSpecBuild.gitignore.addPatterns('db-build-report.txt');
serviceSpecBuild.synth();

const cfnResources = new TypeScriptWorkspace({
  parent: repo,
  name: '@aws-cdk/cfn-resources',
  description: 'L1 constructs for all CloudFormation Resources',
  deps: [],
  peerDeps: ['aws-cdk-lib@^2', 'constructs@^10.0.0'],
  peerDependencyOptions: {
    pinnedDevDependency: false,
  },
  devDeps: [
    serviceSpec,
    serviceSpecBuild,
    tsKb,
    typewriter,
    '@jsii/spec',
    '@swc/core',
    '@types/fs-extra@^9',
    'aws-cdk-lib',
    'camelcase',
    'constructs',
    'fs-extra',
    'ts-node',
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
    exec: 'ts-node --project tsconfig.dev.json src/cli/main.ts --augmentations-support',
    receiveArgs: true,
  }),
);
cfnResources.synth();

const cfn2ts = new TypeScriptWorkspace({
  parent: repo,
  name: '@aws-cdk/cfn2ts',
  description: 'Drop-in replacement for cfn2ts',
  private: true,
  deps: [cfnResources, serviceSpec, 'yargs', 'fs-extra'],
});
cfn2ts.synth();

// Add integration test with aws-cdk
new AwsCdkIntgrationTest(cfn2ts);

repo.synth();
