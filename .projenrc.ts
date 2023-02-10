import * as pj from 'projen';
import { MergeQueue, MonorepoRoot, MonorepoTypeScriptProject } from './projenrc';

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
  autoApproveUpgrades: true,
  autoApproveOptions: {
    allowedUsernames: ['github-bot', 'cdklabs-automation'],
    secret: 'GITHUB_TOKEN',
  },
  githubOptions: {
    mergify: false,
  },
});
new MergeQueue(repo, {
  autoMergeOptions: {
    secret: 'PROJEN_GITHUB_TOKEN',
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
  deps: ['ajv', 'glob'],
  devDeps: [tsKb, 'ts-json-schema-generator', '@types/glob', 'ajv-cli'],
  private: true,
});
for (const tsconfig of [serviceSpecSources.tsconfig, serviceSpecSources.tsconfigDev]) {
  tsconfig?.addInclude('src/**/*.json');
}

const serviceSpecSchemaTask = serviceSpecSources.addTask('gen-schemas', {
  steps: ['CloudFormationRegistryResource'].map((typeName: string) => ({
    exec: [
      'ts-json-schema-generator',
      '--path',
      './src/types/index.ts',
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
  private: true,
});
serviceSpecBuild.gitignore.addPatterns('db.json');
serviceSpecBuild.synth();

// Hide most of the generated files from VS Code
repo.vscode?.settings.addSettings({
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
  'eslint.format.enable': true,
});

// Formatting
repo.vscode?.extensions.addRecommendations('esbenp.prettier-vscode', 'dbaeumer.vscode-eslint');
repo.vscode?.settings.addSetting('editor.defaultFormatter', 'esbenp.prettier-vscode');
repo.vscode?.settings.addSetting('eslint.format.enable', true);
repo.vscode?.settings.addSettings({ 'editor.defaultFormatter': 'dbaeumer.vscode-eslint' }, [
  'javascript',
  'typescript',
]);

repo.synth();
