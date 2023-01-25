import * as pj from 'projen';
import { TrailingComma } from 'projen/lib/javascript';

const project = new pj.typescript.TypeScriptProject({
  defaultReleaseBranch: 'main',
  name: 'awscdk-service-spec',
  description: 'Monorepo for the AWS CDK\'s service spec',
  projenrcTs: true,

  eslint: true,
  prettier: true,
  prettierOptions: {
    settings: {
      singleQuote: true,
      trailingComma: TrailingComma.ALL,
    },
  },
  release: true,

  githubOptions: {
    mergify: false,
  },
});
project.gitignore.addPatterns('.DS_Store');

const tsKb = new pj.typescript.TypeScriptProject({
  parent: project,
  name: '@cdklabs/tskb',
  description: 'Using TypeScript as a knowledge base',
  repositoryDirectory: 'packages/@cdklabs/tskb',
  outdir: 'packages/@cdklabs/tskb',

  autoDetectBin: true,
  defaultReleaseBranch: 'REQUIRED-BUT-SHOULDNT-BE',
  release: false,
});
tsKb.synth();

const serviceSpecSources = new pj.typescript.TypeScriptProject({
  parent: project,
  name: '@aws-cdk/service-spec-sources',
  repositoryDirectory: 'packages/@aws-cdk/service-spec-sources',
  outdir: 'packages/@aws-cdk/service-spec-sources',
  description: 'Sources for the service spec',

  defaultReleaseBranch: 'REQUIRED-BUT-SHOULDNT-BE',
  release: false,
});
serviceSpecSources.synth();

const serviceSpecBuild = new pj.typescript.TypeScriptProject({
  parent: project,
  name: '@aws-cdk/service-spec-build',
  repositoryDirectory: 'packages/@aws-cdk/service-spec-build',
  outdir: 'packages/@aws-cdk/service-spec-build',
  description: 'Build the service spec',

  defaultReleaseBranch: 'REQUIRED-BUT-SHOULDNT-BE',
  release: false,
});
serviceSpecBuild.synth();

const serviceSpec = new pj.typescript.TypeScriptProject({
  parent: project,
  name: '@aws-cdk/service-spec',
  repositoryDirectory: 'packages/@aws-cdk/service-spec',
  outdir: 'packages/@aws-cdk/service-spec',
  description: 'AWS CDK Service spec',

  defaultReleaseBranch: 'REQUIRED-BUT-SHOULDNT-BE',
  release: false,
});
serviceSpec.synth();

project.synth();
