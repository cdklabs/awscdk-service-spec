import { yarn } from 'cdklabs-projen-project-types';
import { DependencyType } from 'projen';
import { YarnMonorepo } from './monorepo';

export class TypeScriptWorkspace extends yarn.TypeScriptWorkspace {
  private isPrivatePackage: boolean;
  private monorepo: YarnMonorepo;

  public constructor(options: yarn.TypeScriptWorkspaceOptions) {
    super(options);
    this.monorepo = options.parent as YarnMonorepo;
    this.isPrivatePackage = options.private ?? false;

    // If the package is public, all local deps and peer deps must also be public
    if (!this.isPrivatePackage) {
      const illegalPrivateDeps = this.localDeps([DependencyType.RUNTIME, DependencyType.PEER])?.filter(
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
  }

  /**
   * Return all dependencies that are local to the monorepo
   * Optionally filter by dependency type.
   */
  private localDeps(types?: DependencyType[]): TypeScriptWorkspace[] {
    return this.monorepo.subprojects.filter((sibling) =>
      this.deps.all.some((d) => d.name === sibling.name && (!types || types.includes(d.type))),
    );
  }
}
