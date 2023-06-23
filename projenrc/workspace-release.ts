import { Component, Task, github, release } from 'projen';
import { TypeScriptWorkspace } from './workspace';
import { GatherVersions, VersionMatch } from './gather-versions.task';

export interface WorkspaceReleaseOptions {
  readonly private: boolean;
  readonly workflowNodeVersion?: string;
  readonly releaseWorkflowSetupSteps?: Array<github.workflows.JobStep>;
  readonly postBuildSteps?: Array<github.workflows.JobStep>;
  readonly publishToNpm?: boolean;
}

export class WorkspaceRelease extends Component {
  public release?: release.Release;

  public constructor(project: TypeScriptWorkspace, options: WorkspaceReleaseOptions) {
    super(project);

    // The root package is release-aware. Either we create a proper
    // 'yarn release' task here, or we create a fake one that just does
    // a 'build' (will be run in dependency order by the parent release task).
    if (!options.private) {
      this.release = new release.Release(project, {
        versionFile: 'package.json', // this is where "version" is set after bump
        task: project.buildTask,
        branch: 'main',
        artifactsDirectory: project.artifactsDirectory,
        ...options,

        releaseWorkflowSetupSteps: [
          ...project.renderWorkflowSetup({ mutable: false }),
          ...(options.releaseWorkflowSetupSteps ?? []),
        ],
        postBuildSteps: [...(options.postBuildSteps ?? [])],

        workflowNodeVersion: options.workflowNodeVersion,

        // This mixes the package name into the tag name,
        // so that we can give packages individual versions.
        // Tags end up looking like this: @scope/package@v1.2.3
        releaseTagPrefix: `${project.name}@`,

        // In a monorepo, we want standard-version to only consider the directory of the workspace
        versionrcOptions: {
          path: '.',
        },
      });

      // Only releasing at the monorepo level is supported
      project.tasks.removeTask('release');

      // GitHub Releases comes for free with a `Release` component, NPM must be added explicitly
      if (options.publishToNpm ?? true) {
        this.release.publisher.publishToNpm({
          registry: project.package.npmRegistry,
          npmTokenSecret: project.package.npmTokenSecret,
        });
      }
    }

    // This tasks sets all local dependencies to their current version
    // In the monorepo we call this task in topological order.
    // Therefor it is guaranteed that any local packages a package depends on,
    // already have been bumped.
    const gatherVersions = project.addTask('gather-versions', {
      steps: [new GatherVersions(project, VersionMatch.MAJOR)],
    });
    this.obtainBumpTask().prependSpawn(gatherVersions);

    // After we have unbumped package versions back to 0.0.0,
    // we can run the gather-versions task again which will now replace the to-be-release versions with 0.0.0
    this.obtainUnbumpTask().spawn(gatherVersions);
  }

  /**
   * Get the bump version task
   *
   * If this is a private package, it won't have a bump task yet.
   * So instead we create an empty one that can be called from the monorepo root
   * and serve as a container for other steps that need to occur as part of the release
   */
  private obtainBumpTask(): Task {
    return (
      this.project.tasks.tryFind('bump') ??
      this.project.addTask('bump', {
        description: 'Bumps versions of local dependencies',
      })
    );
  }

  /**
   * Get the unbump version task
   *.
   * If this is a private package, it won't have a bump task yet
   * So instead we create an empty one that can be called from the monorepo root
   * and serve as a container for other steps that need to occur as part of the release
   */
  private obtainUnbumpTask(): Task {
    return (
      this.project.tasks.tryFind('unbump') ??
      this.project.addTask('unbump', {
        description: 'Resets versions of local dependencies to 0.0.0',
      })
    );
  }
}
