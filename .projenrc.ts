import * as pj from 'projen';
import { MergeQueue, MonorepoRoot, MonorepoTypeScriptProject } from './projenrc';
import * as canonicalize from 'canonicalize';

const lfsPatterns = ['sources/**/*.json'];

const repo = new MonorepoRoot({
  defaultReleaseBranch: 'main',
  name: 'awscdk-service-spec',
  description: "Monorepo for the AWS CDK's service spec",
  projenrcTs: true,

  prettier: true,
  prettierOptions: {
    settings: {
      printWidth: 120,
      singleQuote: true,
      trailingComma: pj.javascript.TrailingComma.ALL,
    },
  },
  release: false,
  autoApproveUpgrades: true,
  autoApproveOptions: {
    allowedUsernames: ['github-bot', 'cdklabs-automation'],
    secret: 'GITHUB_TOKEN',
  },
  githubOptions: {
    mergify: false,
  },
  gitOptions: {
    lfsPatterns,
  },
});
new MergeQueue(repo, {
  autoMergeOptions: {
    secret: 'PROJEN_GITHUB_TOKEN',
  },
});

// Tell GitHub to hide these files from diffs and not count the lines by default
for (const lfsPattern of lfsPatterns) {
  repo.gitattributes.addAttributes(lfsPattern, 'linguist-generated=true');
}

const tsKb = new MonorepoTypeScriptProject({
  parent: repo,
  name: '@cdklabs/tskb',
  description: 'Using TypeScript as a knowledge base',
});
tsKb.synth();

const typewriter = new MonorepoTypeScriptProject({
  parent: repo,
  name: '@cdklabs/typewriter',
  description: 'Write typed code for jsii',
  deps: ['@jsii/spec'],
});
typewriter.synth();

const serviceSpecSources = new MonorepoTypeScriptProject({
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

const serviceSpec = new MonorepoTypeScriptProject({
  parent: repo,
  name: '@aws-cdk/service-spec',
  description: 'AWS CDK Service spec',
  deps: [tsKb],
});
serviceSpec.synth();

const serviceSpecBuild = new MonorepoTypeScriptProject({
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

const cfnResources = new MonorepoTypeScriptProject({
  parent: repo,
  name: '@aws-cdk/cfn-resources',
  description: 'L1 constructs for all CloudFormation Resources',
  devDeps: [typewriter, serviceSpecBuild, tsKb, 'ts-node', '@jsii/spec', 'fs-extra', '@types/fs-extra@^9', '@swc/core'],
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
