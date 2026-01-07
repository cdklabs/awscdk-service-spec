import * as pj from 'projen';
import { AwsCdkIntegrationTest, DiffDb, TypeScriptWorkspace, YarnMonorepo } from './projenrc';
import { RegionalSource, Role, SingleSource, SourceProcessing } from './projenrc/update-sources';

const workflowRunsOn = [
  // 'ubuntu-latest',
  'awscdk-service-spec_ubuntu-latest_32-core',
];

const repo = new YarnMonorepo({
  name: 'awscdk-service-spec',
  description: "Monorepo for the AWS CDK's service spec",
  repository: 'https://github.com/cdklabs/awscdk-service-spec',

  defaultReleaseBranch: 'main',
  devDeps: [
    'cdklabs-projen-project-types',
    'node-fetch@^2',
    'eslint',
    '@typescript-eslint/parser@^6',
    '@typescript-eslint/eslint-plugin@^6',
    '@stylistic/eslint-plugin@^2',
    'eslint-plugin-import',
  ],
  vscodeWorkspace: true,
  nx: true,

  prettier: true,
  prettierOptions: {
    settings: {
      printWidth: 120,
      singleQuote: true,
      trailingComma: pj.javascript.TrailingComma.ALL,
    },
  },
  workflowRunsOn,
  gitignore: ['.DS_Store'],
  gitOptions: {
    lfsPatterns: ['sources/**/*.json'],
  },

  tsconfig: {
    compilerOptions: {
      target: 'ES2022',
      lib: ['es2022'],
    },
  },

  autoApproveOptions: {
    allowedUsernames: ['aws-cdk-automation', 'dependabot[bot]'],
  },

  release: true,
  releaseOptions: {
    publishToNpm: true,
    releaseTrigger: pj.release.ReleaseTrigger.scheduled({
      schedule: '11 2 * * 3,6',
    }),
  },
  npmTrustedPublishing: true,
  releaseEnvironment: 'release',

  githubOptions: {
    pullRequestLintOptions: {
      semanticTitleOptions: {
        types: ['feat', 'fix', 'chore', 'refactor'],
      },
    },
  },
});

const tsKb = new TypeScriptWorkspace({
  parent: repo,
  name: '@cdklabs/tskb',
  description: 'Using TypeScript as a knowledge base',
  deps: [],
  releasableCommits: pj.ReleasableCommits.featuresAndFixes('.'),
});

// @ts-ignore TS6133 'typewriter' is declared but its value is never read.
const typewriter = new TypeScriptWorkspace({
  parent: repo,
  name: '@cdklabs/typewriter',
  description: 'Write typed code for jsii',
  deps: [],
  releasableCommits: pj.ReleasableCommits.featuresAndFixes('.'),
});

const serviceSpecTypes = new TypeScriptWorkspace({
  parent: repo,
  name: '@aws-cdk/service-spec-types',
  description: 'Types for CloudFormation Service Specifications',
  deps: [tsKb],
  // Also include changes to sources
  releasableCommits: pj.ReleasableCommits.featuresAndFixes('. ../../../sources'),
});

const serviceSpecImporters = new TypeScriptWorkspace({
  parent: repo,
  name: '@aws-cdk/service-spec-importers',
  description: 'Import service sources into a service model database',
  deps: [
    'ajv@^6',
    'canonicalize',
    'chalk@^4',
    'commander',
    'fast-json-patch',
    'fs-extra',
    'glob@^8',
    serviceSpecTypes,
    'sort-json',
    tsKb,
  ],
  devDeps: ['@types/fs-extra', '@types/glob@^8', 'ajv-cli@^5', 'source-map-support', 'ts-json-schema-generator'],
  private: false,
  tsconfig: {
    compilerOptions: {
      skipLibCheck: true,
      target: 'ES2022',
      lib: ['es2022'],
    },
  },
});

for (const tsconfig of [serviceSpecImporters.tsconfig, serviceSpecImporters.tsconfigDev]) {
  tsconfig?.addInclude('src/**/*.json');
}

const serviceSpecSchemaTask = serviceSpecImporters.addTask('gen-schemas', {
  steps: [
    'CloudFormationRegistryResource',
    'CloudFormationResourceSpecification',
    'SAMResourceSpecification',
    'CloudFormationDocumentation',
    'StatefulResources',
    'SamTemplateSchema',
    'CloudWatchConsoleServiceDirectory',
    'GetAttAllowList',
    'CfnPrimaryIdentifierOverrides',
    'OobRelationshipData',
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

serviceSpecImporters.compileTask.prependSpawn(serviceSpecSchemaTask);

serviceSpecImporters.tasks.addTask('build:db', {
  exec: 'ts-node src/cli/import-db',
  receiveArgs: true,
});
serviceSpecImporters.tasks.addTask('analyze:db', {
  exec: 'ts-node src/cli/analyze-db',
  receiveArgs: true,
});
serviceSpecImporters.tasks.addTask('diff:db', {
  exec: 'ts-node src/cli/diff-db',
  receiveArgs: true,
});
serviceSpecImporters.gitignore.addPatterns('db.json');
serviceSpecImporters.gitignore.addPatterns('build-report');

const awsServiceSpec = new TypeScriptWorkspace({
  parent: repo,
  name: '@aws-cdk/aws-service-spec',
  description: 'A specification of built-in AWS resources',
  deps: [tsKb, serviceSpecTypes],
  devDeps: ['source-map-support', serviceSpecImporters],
  // Also include changes to types and sources
  releasableCommits: pj.ReleasableCommits.featuresAndFixes('. ../service-spec-types ../../../sources'),
});

awsServiceSpec.tsconfigDev.addInclude('build');

// Needs to be added to 'compile' task, because the integ tests will 'compile' everything (but not run the tests and linter).
awsServiceSpec.compileTask.prependSpawn(
  awsServiceSpec.tasks.addTask('build:db', {
    exec: `ts-node build/build-db.ts`,
  }),
);

awsServiceSpec.gitignore.addPatterns('db.json');
awsServiceSpec.gitignore.addPatterns('db.json.gz');
awsServiceSpec.gitignore.addPatterns('build-report');
awsServiceSpec.npmignore?.addPatterns('build-report');
awsServiceSpec.npmignore?.addPatterns('/build/');

// Add integration test with aws-cdk
new AwsCdkIntegrationTest(repo, {
  workflowRunsOn,
  serviceSpec: awsServiceSpec,
  serviceSpecTypes,
});

// Post diff of database
new DiffDb(repo, {
  workflowRunsOn,
  serviceSpec: awsServiceSpec,
  serviceSpecImporters,
});

// Update sources
new SingleSource(repo, {
  name: 'documentation',
  dir: 'sources/CloudFormationDocumentation',
  fileName: 'CloudFormationDocumentation.json',
  source: 's3://230541556993-cfn-docs/cfn-docs.json',
  awsAuth: {
    region: 'us-east-1',
    roleToAssume: Role.fromGitHubSecret('AWS_ROLE_TO_ASSUME'),
    roleSessionName: 'awscdk-service-spec',
    roleDurationSeconds: 900,
  },
});
new SingleSource(repo, {
  name: 'sam-spec',
  dir: 'sources/CloudFormationResourceSpecification/us-east-1/100_sam/000_official',
  source: 'https://raw.githubusercontent.com/awslabs/goformation/master/generate/sam-2016-10-31.json',
  fileName: 'spec.json',
});
new RegionalSource(repo, {
  name: 'cfn-schema',
  dir: 'sources/CloudFormationSchema',
  postProcessing: SourceProcessing.EXTRACT,
  sources: {
    'us-east-1': 'https://schema.cloudformation.us-east-1.amazonaws.com/CloudformationSchema.zip',
    'us-east-2': 'https://schema.cloudformation.us-east-2.amazonaws.com/CloudformationSchema.zip',
    'us-west-2': 'https://schema.cloudformation.us-west-2.amazonaws.com/CloudformationSchema.zip',
  },
});
new SingleSource(repo, {
  name: 'sam',
  dir: 'sources/SAMSpec',
  source: 'https://raw.githubusercontent.com/awslabs/goformation/master/schema/sam.schema.json',
});
new SingleSource(repo, {
  name: 'arn-templates',
  dir: 'sources/ArnTemplates',
  fileName: 'arn-templates.json',
  source: 's3://962595532322-arn-templates/arn-templates.json',
  awsAuth: {
    region: 'us-east-1',
    roleToAssume: Role.fromGitHubSecret('AWS_ROLE_TO_ASSUME'),
    roleSessionName: 'awscdk-service-spec',
    roleDurationSeconds: 900,
  },
});
new SingleSource(repo, {
  name: 'log-source-resource',
  dir: 'sources/LogSources',
  source: 's3://508003923337-log-source-templates/log-source-resource.json',
  awsAuth: {
    region: 'us-east-1',
    roleToAssume: Role.fromGitHubSecret('AWS_ROLE_TO_ASSUME'),
    roleSessionName: 'awscdk-service-spec',
    roleDurationSeconds: 900,
  },
});

// https://github.com/aws-cloudformation/cfn-lint/pull/3257
new SingleSource(repo, {
  name: 'stateful-resources',
  dir: 'sources/StatefulResources',
  source:
    'https://raw.githubusercontent.com/aws-cloudformation/cfn-lint/main/src/cfnlint/data/AdditionalSpecs/StatefulResources.json',
});

repo.synth();
