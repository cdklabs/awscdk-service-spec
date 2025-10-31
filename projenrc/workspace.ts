import { yarn } from 'cdklabs-projen-project-types';
import { ReleasableCommits } from 'projen';

export interface TypeScriptWorkspaceOptions extends yarn.TypeScriptWorkspaceOptions {
  readonly releasableCommits?: ReleasableCommits;
}

export class TypeScriptWorkspace extends yarn.TypeScriptWorkspace {
  public constructor(options: TypeScriptWorkspaceOptions) {
    super({
      npmTrustedPublishing: true,
      ...options,
    });

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

    // Exclude files from package
    this.npmignore?.addPatterns('/.eslintrc.js');
    this.npmignore?.addPatterns('/.gitattributes');
    this.npmignore?.addPatterns('/.prettierignore');
    this.npmignore?.addPatterns('/.prettierrc.json');
  }
}
