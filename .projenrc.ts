import { TrailingComma } from 'projen/lib/javascript';
import { MonorepoRoot, MonorepoTypeScriptProject } from './projenrc/monorepo';

const repo = new MonorepoRoot({
  defaultReleaseBranch: 'main',
  name: 'awscdk-service-spec',
  description: "Monorepo for the AWS CDK's service spec",
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

const tsKb = new MonorepoTypeScriptProject({
  parent: repo,
  name: '@cdklabs/tskb',
  description: 'Using TypeScript as a knowledge base',
});
tsKb.synth();

const serviceSpecSources = new MonorepoTypeScriptProject({
  parent: repo,
  name: '@aws-cdk/service-spec-sources',
  description: 'Sources for the service spec',
  devDeps: ['@cdklabs/tskb'],
});
serviceSpecSources.compileTask.prependExec('gen-jd'); // Comes from tskb
serviceSpecSources.synth();

const serviceSpecBuild = new MonorepoTypeScriptProject({
  parent: repo,
  name: '@aws-cdk/service-spec-build',
  description: 'Build the service spec',
});
serviceSpecBuild.synth();

const serviceSpec = new MonorepoTypeScriptProject({
  parent: repo,
  name: '@aws-cdk/service-spec',
  description: 'AWS CDK Service spec',
});
serviceSpec.synth();

repo.synth();
