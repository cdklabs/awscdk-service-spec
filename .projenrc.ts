import * as pj from 'projen';
import { JsonFile } from 'projen';
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
      printWidth: 120,
      singleQuote: true,
      trailingComma: pj.javascript.TrailingComma.ALL,
    },
  },
  release: false,

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
  devDeps: [tsKb],
  private: true,
});
for (const tsconfig of [serviceSpecSources.tsconfig, serviceSpecSources.tsconfigDev]) {
  tsconfig?.addInclude('src/**/*.json');
}
serviceSpecSources.compileTask.prependExec('gen-jd'); // Comes from tskb
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
  private: true,
});
serviceSpecBuild.synth();

// Hide most of the generated files from VS Code
new JsonFile(repo, '.vscode/settings.json', {
  obj: {
    'files.exclude': {
      '**/.projen': true,
      '**/.eslintrc.js': true,
      '**/.eslintrc.json': true,
      '**/.gitattributes': true,
      '**/.gitignore': true,
      '**/.npmignore': true,
      '**/*.tsbuildinfo': true,
      'packages/**/node_modules': true,
      'packages/**/lib': true,
      '.prettierignore': true,
      '.prettierrc.json': true,
      '**/tsconfig.json': true,
      '**/tsconfig.dev.json': true,
    },
  },
});

repo.synth();

