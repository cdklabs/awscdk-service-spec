import * as pj from 'projen';
import { TrailingComma } from 'projen/lib/javascript';
import { MonorepoTypeScriptProject } from './projenrc/mono-repo-typescript-project';

const repo = new pj.typescript.TypeScriptProject({
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
repo.gitignore.addPatterns('.DS_Store');

// Get the ObjectFile
const packageJson = repo.tryFindObjectFile('package.json');
packageJson?.addOverride('private', true);
packageJson?.addOverride('workspaces', {
  packages: ['packages/*'],
});

const tsConfig = repo.tryFindObjectFile('tsconfig.json');
tsConfig?.addOverride('include', []);
tsConfig?.addOverride('references', [
  { path: 'packages/@cdklabs/tskb' },
  { path: 'packages/@aws-cdk/service-spec-sources' },
  { path: 'packages/@aws-cdk/service-spec-build' },
  { path: 'packages/@aws-cdk/service-spec' },
]);

const tsKb = new MonorepoTypeScriptProject({
  parent: repo,
  name: '@cdklabs/tskb',
  description: 'Using TypeScript as a knowledge base',

  bin: {
    'gen-jd': 'bin/gen-jd',
  },
});
tsKb.synth();

const serviceSpecSources = new MonorepoTypeScriptProject({
  parent: repo,
  name: '@aws-cdk/service-spec-sources',
  description: 'Sources for the service spec',
  devDeps: ['@cdklabs/tskb'],
});
serviceSpecSources.preCompileTask.prependExec('gen-jd'); // Comes from tskb
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
