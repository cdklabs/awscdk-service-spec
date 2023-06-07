import { yarn } from 'cdklabs-projen-project-types';
import { MonorepoReleaseWorkflow, MonorepoReleaseWorkflowOptions } from './monorepo-release';
import { Nx } from './nx';

export interface YarnMonoRepoOptions extends yarn.CdkLabsMonorepoOptions {
  /**
   * Whether or not to renable release workflows for this repository
   *
   * @default - No releasing
   */
  readonly release?: boolean;

  /**
   * Options for the release job
   */
  readonly releaseOptions?: MonorepoReleaseWorkflowOptions;
}

export class YarnMonorepo extends yarn.CdkLabsMonorepo {
  public constructor(options: YarnMonoRepoOptions) {
    super(options);

    // Hide generated config files in VSCode
    this.vscode?.settings.addSettings({
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
    for (const lfsPattern of options.gitOptions?.lfsPatterns || []) {
      this.gitattributes.addAttributes(lfsPattern, 'linguist-generated=true');
    }

    // Launch Config for projen synth
    this.vscode?.launchConfiguration.addConfiguration({
      type: 'node',
      request: 'launch',
      name: 'projen default',
      skipFiles: ['<node_internals>/**'],
      cwd: '${workspaceFolder}',
      runtimeExecutable: 'npx',
      runtimeArgs: ['projen', 'default'],
      outFiles: ['${workspaceFolder}/**/*'],
    } as any);

    // nx
    new Nx(this, {
      defaultBase: options.defaultReleaseBranch,
    });

    if (options.release) {
      new MonorepoReleaseWorkflow(this, options.releaseOptions);
    }
  }
}
