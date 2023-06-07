import { yarn } from 'cdklabs-projen-project-types';
import { DependencyType, release } from 'projen';
import { MonorepoReleaseWorkflow } from './monorepo-release';
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

    const monoRelease = MonorepoReleaseWorkflow.of(options.parent);
    if (monoRelease) {
      // The root package is release-aware. Either we create a proper
      // 'yarn release' task here, or we create a fake one that just does
      // a 'build' (will be run in dependency order by the parent release task).
      if (!options.private) {
        const rls = new release.Release(this, {
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
          releaseTagPrefix: `${this.name}@`,
        });
        monoRelease.addMonorepoRelease(this.workspaceDirectory, rls);

        // GitHub Releases comes for free with a `Release` component, NPM must be added explicitly.
        rls.publisher.publishToNpm({
          registry: this.package.npmRegistry,
          npmTokenSecret: this.package.npmTokenSecret,
        });
      } else {
        const rlsTask = this.addTask('release', {
          description: 'Build this private package as part of doing a release',
        });
        rlsTask.spawn(this.buildTask);
      }
    }
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
