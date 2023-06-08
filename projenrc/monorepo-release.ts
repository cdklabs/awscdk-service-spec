import * as path from 'path';
import { github, release, Component, Project, Task } from 'projen';
import { BUILD_ARTIFACT_NAME, PERMISSION_BACKUP_FILE } from 'projen/lib/github/constants';

// copied from projen/release.ts
const RELEASE_JOBID = 'release';
const GIT_REMOTE_STEPID = 'git_remote';
const LATEST_COMMIT_OUTPUT = 'latest_commit';

type UpstreamReleaseOptions = Omit<
  release.ReleaseProjectOptions,
  | 'releaseEveryCommit'
  | 'releaseSchedule'
  | 'releaseBranches'
  | 'releaseFailureIssue'
  | 'releaseFailureIssueLabel'
  | 'releaseTagPrefix'
  | 'versionrcOptions'
  | 'publishTasks'
>;

export interface MonorepoReleaseWorkflowOptions extends UpstreamReleaseOptions {
  /**
   * Branch name to release from
   *
   * @default 'main'
   */
  readonly branchName?: string;

  /**
   * Node version
   */
  readonly nodeVersion?: string;
}

export class MonorepoReleaseWorkflow extends Component {
  /**
   * Returns the `MonorepoReleaseWorkflow` component of a project or `undefined` if the project
   * does not have a MonorepoReleaseWorkflow component.
   */
  public static of(project: Project): MonorepoReleaseWorkflow | undefined {
    const isMonorepoReleaseWorkflow = (c: Component): c is MonorepoReleaseWorkflow =>
      c instanceof MonorepoReleaseWorkflow;
    return project.components.find(isMonorepoReleaseWorkflow);
  }

  private readonly branchName: string;
  private readonly github: github.GitHub;
  private readonly releaseTrigger: release.ReleaseTrigger;
  private readonly packagesToRelease = new Array<{
    readonly workspaceDirectory: string;
    readonly release: release.Release;
  }>();

  private workflow?: github.TaskWorkflow;
  private releaseAllTask?: Task;

  constructor(project: Project, private readonly options: MonorepoReleaseWorkflowOptions = {}) {
    super(project);

    this.branchName = options.branchName ?? 'main';
    const gh = github.GitHub.of(project);
    if (!gh) {
      throw new Error(`Project is not a GitHub project: ${project}`);
    }
    this.github = gh;
    this.releaseTrigger = options.releaseTrigger ?? release.ReleaseTrigger.continuous();
  }

  public addMonorepoRelease(subdir: string, release: release.Release) {
    const task = this.obtainReleaseAllTask();
    task.exec('yarn release', { cwd: subdir });
    this.packagesToRelease.push({ workspaceDirectory: subdir, release });
    // The rest happens during preSynthesize
  }

  public preSynthesize() {
    if (!this.releaseAllTask) {
      // We didn't end up adding any packages
      return;
    }

    // anti-tamper check (fails if there were changes to committed files)
    // this will identify any non-committed files generated during build (e.g. test snapshots)
    this.releaseAllTask.exec(release.Release.ANTI_TAMPER_CMD);

    this.renderPackageUploads();
    this.renderPublishJobs();
  }

  private renderPackageUploads() {
    const noNewCommits = `\${{ steps.${GIT_REMOTE_STEPID}.outputs.${LATEST_COMMIT_OUTPUT} == github.sha }}`;

    for (const { workspaceDirectory, release } of this.packagesToRelease) {
      const job = this.workflow?.getJob(RELEASE_JOBID) as github.workflows.Job | undefined;
      job?.steps.push(
        {
          name: `${release.project.name}: Backup artifact permissions`,
          if: noNewCommits,
          continueOnError: true,
          run: `cd ${release.artifactsDirectory} && getfacl -R . > ${PERMISSION_BACKUP_FILE}`,
          workingDirectory: workspaceDirectory,
        },
        {
          name: `${release.project.name}: Upload artifact`,
          if: noNewCommits,
          uses: 'actions/upload-artifact@v3',
          with: {
            // Every artifact must have a unique name
            name: buildArtifactName(release.project),
            path: path.join(workspaceDirectory, release.artifactsDirectory),
          },
        },
      );
    }
  }

  private renderPublishJobs() {
    for (const { workspaceDirectory, release } of this.packagesToRelease) {
      const packagePublishJobs = release.publisher._renderJobsForBranch(this.branchName, {
        majorVersion: this.options.majorVersion,
        minMajorVersion: this.options.minMajorVersion,
        npmDistTag: this.options.npmDistTag,
        prerelease: this.options.prerelease,
      });

      for (const job of Object.values(packagePublishJobs)) {
        job.steps.unshift({
          name: `Navigate to ${release.project.name}`,
          run: `cd ${workspaceDirectory}`,
        });

        // Find the 'download-artifact' job and replace the build artifact name with the unique per-project one
        const downloadStep = job.steps.find((job) => job.uses === 'actions/download-artifact@v3');
        if (!downloadStep) {
          throw new Error(`Could not find downloadStep among steps: ${JSON.stringify(job.steps, undefined, 2)}`);
        }
        (downloadStep.with ?? {}).name = buildArtifactName(release.project);
      }

      // Make the job names unique
      this.workflow?.addJobs(
        Object.fromEntries(
          Object.entries(packagePublishJobs).map(([key, job]) => [slugify(`${release.project.name}_${key}`), job]),
        ),
      );
    }
  }

  private obtainReleaseAllTask(): Task {
    if (this.releaseAllTask) {
      return this.releaseAllTask;
    }

    const env: Record<string, string> = {
      RELEASE: 'true',
    };

    if (this.options.majorVersion !== undefined) {
      env.MAJOR = this.options.majorVersion.toString();
    }

    if (this.options.minMajorVersion !== undefined) {
      if (this.options.majorVersion !== undefined) {
        throw new Error(`minMajorVersion and majorVersion cannot be used together.`);
      }

      env.MIN_MAJOR = this.options.minMajorVersion.toString();
    }

    this.releaseAllTask = this.project.addTask('release:all', {
      description: `Prepare a release from all monorepo packages`,
      env,
    });
    this.createPublishingMechanism();
    return this.releaseAllTask;
  }

  private createPublishingMechanism() {
    if (this.releaseTrigger.isManual) {
      this.createPublishTask();
    } else {
      this.createPublishWorkflow();
    }
  }

  private createPublishTask() {
    throw new Error('Manual publishing is not supported right now');
  }

  private createPublishWorkflow() {
    const workflowName =
      this.options.releaseWorkflowName ??
      (['master', 'main'].includes(this.branchName) ? 'release' : `release-${this.branchName}`);

    // The arrays are being cloned to avoid accumulating values from previous branches
    const preBuildSteps = [
      {
        name: 'Setup Node.js',
        uses: 'actions/setup-node@v3',
        with: {
          'node-version': (this.project as any).nodeVersion ?? '16.14.0',
        },
      },
      {
        name: 'Install dependencies',
        run: 'yarn install --check-files --frozen-lockfile',
      },
      ...(this.options.releaseWorkflowSetupSteps ?? []),
    ];
    const postBuildSteps = [...(this.options.postBuildSteps ?? [])];

    // check if new commits were pushed to the repo while we were building.
    // if new commits have been pushed, we will cancel this release
    postBuildSteps.push({
      name: 'Check for new commits',
      id: GIT_REMOTE_STEPID,
      run: `echo "${LATEST_COMMIT_OUTPUT}=$(git ls-remote origin -h \${{ github.ref }} | cut -f1)" >> $GITHUB_OUTPUT`,
    });

    this.workflow = new github.TaskWorkflow(this.github, {
      name: workflowName,
      jobId: RELEASE_JOBID,
      outputs: {
        latest_commit: {
          stepId: GIT_REMOTE_STEPID,
          outputName: LATEST_COMMIT_OUTPUT,
        },
      },
      triggers: {
        schedule: this.releaseTrigger.schedule ? [{ cron: this.releaseTrigger.schedule }] : undefined,
        push: this.releaseTrigger.isContinuous ? { branches: [this.branchName] } : undefined,
      },
      container: this.options.workflowContainerImage ? { image: this.options.workflowContainerImage } : undefined,
      env: {
        CI: 'true',
      },
      permissions: {
        contents: 'write' as any,
      },
      checkoutWith: {
        // we must use 'fetch-depth=0' in order to fetch all tags
        // otherwise tags are not checked out
        'fetch-depth': 0,
      },
      preBuildSteps,
      task: this.releaseAllTask!,
      postBuildSteps,
      runsOn: this.options.workflowRunsOn,
    });
  }
}

function slugify(x: string): string {
  return x.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^[0-9-]+/, '');
}

function buildArtifactName(project: Project) {
  return slugify(`${project.name}_${BUILD_ARTIFACT_NAME}`);
}
