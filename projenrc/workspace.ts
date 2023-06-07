import { yarn } from 'cdklabs-projen-project-types';
import { release } from 'projen';

export class TypeScriptWorkspace extends yarn.TypeScriptWorkspace {
  public constructor(options: yarn.TypeScriptWorkspaceOptions) {
    super(options);

    // Allow a force compile, this is required because we use composite projects
    this.tasks.tryFind('compile')?.reset('tsc --build', {
      receiveArgs: true,
    });

    // Launch Config for projen synth
    options.parent.vscode?.launchConfiguration.addConfiguration({
      type: 'node',
      request: 'launch',
      name: `${this.name}: compile --force`,
      skipFiles: ['<node_internals>/**'],
      cwd: `\${workspaceFolder}/${this.workspaceDirectory}`,
      runtimeExecutable: 'npx',
      runtimeArgs: ['projen', 'compile', '--force'],
      outFiles: [`\${workspaceFolder}/${this.workspaceDirectory}/${this.libdir}/**/*.js`],
    } as any);

    if (!options.private) {
      new release.Release(this, {
        versionFile: 'package.json', // this is where "version" is set after bump
        task: this.buildTask,
        branch: 'main',
        artifactsDirectory: this.artifactsDirectory,
        ...options,

        releaseWorkflowSetupSteps: [
          ...this.renderWorkflowSetup({ mutable: false }),
          ...(options.releaseWorkflowSetupSteps ?? []),
        ],
        postBuildSteps: [...(options.postBuildSteps ?? [])],

        workflowNodeVersion: this.nodeVersion,

        // This mixes the package name into the tag name, so that we can give packages individual
        // versions.
        releaseTagPrefix: `${this.name}-`,
      });
    }
  }
}
