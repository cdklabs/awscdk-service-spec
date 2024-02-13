import * as path from 'path';
import { github, release, Component, Project, Task } from 'projen';
import { BUILD_ARTIFACT_NAME, PERMISSION_BACKUP_FILE } from 'projen/lib/github/constants';
import { WorkspaceRelease, WorkspaceReleaseOptions } from './workspace-release';
import { TypeScriptWorkspace } from './workspace';

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

export interface MonorepoReleaseOptions extends UpstreamReleaseOptions {
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

  /**
   * Publish packages to npm
   * @default true
   */
  readonly publishToNpm?: boolean;
}

export class MonorepoRelease extends Component {
  /**
   * Returns the `MonorepoReleaseWorkflow` component of a project or `undefined` if the project
   * does not have a MonorepoReleaseWorkflow component.
   */
  public static of(project: Project): MonorepoRelease | undefined {
    const isMonorepoReleaseWorkflow = (c: Component): c is MonorepoRelease => c instanceof MonorepoRelease;
    return project.components.find(isMonorepoReleaseWorkflow);
  }

  private readonly branchName: string;
  private readonly github: github.GitHub;
  private readonly releaseTrigger: release.ReleaseTrigger;
  private readonly packagesToRelease = new Array<{
    readonly workspaceDirectory: string;
    readonly release: {
      readonly project: TypeScriptWorkspace;
      readonly publisher: release.Publisher;
    };
  }>();

  private workflow?: github.TaskWorkflow;
  private releaseTask?: Task;

  constructor(project: Project, private readonly options: MonorepoReleaseOptions = {}) {
    super(project);

    this.branchName = options.branchName ?? 'main';
    const gh = github.GitHub.of(project);
    if (!gh) {
      throw new Error(`Project is not a GitHub project: ${project}`);
    }
    this.github = gh;
    this.releaseTrigger = options.releaseTrigger ?? release.ReleaseTrigger.continuous();
  }

  public addWorkspace(project: TypeScriptWorkspace, options: WorkspaceReleaseOptions) {
    const workspaceRelease = new WorkspaceRelease(project, {
      publishToNpm: this.options.publishToNpm,
      ...options,
    });
    if (!options.private && workspaceRelease.publisher) {
      this.obtainReleaseTask();

      this.packagesToRelease.push({
        workspaceDirectory: project.workspaceDirectory,
        release: {
          project: workspaceRelease.project,
          publisher: workspaceRelease.publisher,
        },
      });
    }
  }

  public preSynthesize() {
    if (!this.releaseTask) {
      // We didn't end up adding any packages
      return;
    }

    this.createPublishingMechanism();
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
          run: `cd ${release.project.artifactsDirectory} && getfacl -R . > ${PERMISSION_BACKUP_FILE}`,
          workingDirectory: workspaceDirectory,
        },
        github.WorkflowSteps.uploadArtifact({
          name: `${release.project.name}: Upload artifact`,
          if: noNewCommits,
          with: {
            // Every artifact must have a unique name
            name: buildArtifactName(release.project),
            path: path.join(workspaceDirectory, release.project.artifactsDirectory),
          },
        }),
      );
    }
  }

  private renderPublishJobs() {
    for (const { release } of this.packagesToRelease) {
      const packagePublishJobs = release.publisher._renderJobsForBranch(this.branchName, {
        majorVersion: this.options.majorVersion,
        minMajorVersion: this.options.minMajorVersion,
        npmDistTag: this.options.npmDistTag,
        prerelease: this.options.prerelease,
      });

      for (const job of Object.values(packagePublishJobs)) {
        // Find the 'download-artifact' job and replace the build artifact name with the unique per-project one
        const downloadStep = job.steps.find((job) => job.uses === 'actions/download-artifact@v4');
        if (!downloadStep) {
          throw new Error(`Could not find downloadStep among steps: ${JSON.stringify(job.steps, undefined, 2)}`);
        }
        (downloadStep.with ?? {}).name = buildArtifactName(release.project);
      }

      // Make the job names unique
      this.workflow?.addJobs(
        Object.fromEntries(
          Object.entries(packagePublishJobs).map(([key, job]) => [
            slugify(`${release.project.name}_${key}`),
            {
              ...job,
              if: `\${{ needs.release.outputs.latest_commit == github.sha && needs.release.outputs.${publishProjectOutputId(
                release.project,
              )} == 'true' }}`,
              name: `${release.project.name}: ${job.name}`,
            },
          ]),
        ),
      );
    }
  }

  private obtainReleaseTask(): Task {
    if (this.releaseTask) {
      return this.releaseTask;
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

    this.releaseTask = this.project.addTask('release', {
      description: `Prepare a release from all monorepo packages`,
      env,
    });
    // Unroll out the 'release' task, and do all the phases for each individual package. We need to 'bump' at the same
    // time so that the dependency versions in all 'package.json's are correct.
    this.releaseTask.exec('yarn workspaces run shx rm -rf dist');
    this.releaseTask.exec('yarn workspaces run bump');
    this.releaseTask.exec('yarn workspaces run build');
    this.releaseTask.exec('yarn workspaces run unbump');
    // anti-tamper check (fails if there were changes to committed files)
    // this will identify any non-committed files generated during build (e.g. test snapshots)
    this.releaseTask.exec(release.Release.ANTI_TAMPER_CMD);

    return this.releaseTask;
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

    // Add an output to the job to indicate if a certain package needs publishing
    const shouldPublishOutputs = Object.fromEntries(
      this.packagesToRelease.map(({ release }) => {
        return [
          publishProjectOutputId(release.project),
          {
            stepId: shouldPublishProjectStepId(release.project),
            outputName: 'publish',
          },
        ];
      }),
    );

    // Check if the proposed release tag already exists
    // Only if it doesn't exist yet should we publish
    for (const { workspaceDirectory, release } of this.packagesToRelease) {
      postBuildSteps.push({
        id: shouldPublishProjectStepId(release.project),
        workingDirectory: workspaceDirectory,
        run: `(git ls-remote -q --exit-code --tags origin $(cat dist/releasetag.txt) && (echo "publish=false" >> $GITHUB_OUTPUT)) || echo "publish=true" >> $GITHUB_OUTPUT`,
      });
    }

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
        ...shouldPublishOutputs,
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
        fetchDepth: 0,
      },
      preBuildSteps,
      task: this.releaseTask!,
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

function publishProjectOutputId(project: Project) {
  return `publish-${slugify(project.name)}`;
}

function shouldPublishProjectStepId(project: Project) {
  return `check-${publishProjectOutputId(project)}`;
}
