import { yarn } from 'cdklabs-projen-project-types';
import { DependencyType, ReleasableCommits, javascript } from 'projen';
import { YarnMonorepo } from './monorepo';

export interface TypeScriptWorkspaceOptions extends yarn.TypeScriptWorkspaceOptions {
  readonly releasableCommits?: ReleasableCommits;
}

type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

export class TypeScriptWorkspace extends yarn.TypeScriptWorkspace {
  private isPrivatePackage: boolean;
  private monorepo: YarnMonorepo;

  public constructor(options: TypeScriptWorkspaceOptions) {
    const monorepo = options.parent as YarnMonorepo;
    const defaultOptions: Partial<Mutable<TypeScriptWorkspaceOptions>> = {};
    if (monorepo.monorepoRelease && !options.private) {
      defaultOptions.npmAccess = javascript.NpmAccess.PUBLIC;
    }
    super({
      ...defaultOptions,
      ...options,
    });
    this.monorepo = monorepo;
    this.isPrivatePackage = options.private ?? false;

    // If the package is public, all local deps and peer deps must also be public
    if (!this.isPrivatePackage) {
      const illegalPrivateDeps = this.localDependencies([DependencyType.RUNTIME, DependencyType.PEER])?.filter(
        (dep) => dep.isPrivatePackage,
      );
      if (illegalPrivateDeps.length) {
        this.logger.error(`${this.name} is public and cannot depend on any private packages.`);
        this.logger.error(
          `Please fix these dependencies:\n    - ${illegalPrivateDeps.map((p) => p.name).join('\n    - ')}`,
        );
        throw new Error();
      }
    }

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

    this.monorepo.monorepoRelease?.addWorkspace(this, {
      private: this.isPrivatePackage,
      workflowNodeVersion: this.nodeVersion,
      releasableCommits: options.releasableCommits,
    });

    // Exclude files from package
    this.npmignore?.addPatterns('/.eslintrc.js');
    this.npmignore?.addPatterns('/.gitattributes');
    this.npmignore?.addPatterns('/.prettierignore');
    this.npmignore?.addPatterns('/.prettierrc.json');
  }

  /**
   * Return all dependencies that are local to the monorepo
   * Optionally filter by dependency type.
   */
  public localDependencies(types?: DependencyType[]): TypeScriptWorkspace[] {
    return this.monorepo.subprojects.filter((sibling) =>
      this.deps.all.some((d) => d.name === sibling.name && (!types || types.includes(d.type))),
    );
  }
}
