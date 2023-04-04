import { Component, Task, github, javascript } from 'projen';
import { DownloadScript } from './download-script';
import * as path from 'path';

const UPDATE_JOB_ID = 'update_source';

interface DataSource {
  url: string;
  target: string;
  isZip?: boolean;
}

export interface SourceUpdateOptions {
  readonly name: string;
  readonly sources: DataSource[];
  readonly schedule?: string;
}

abstract class SourceUpdate extends Component {
  public constructor(project: javascript.NodeProject, options: SourceUpdateOptions) {
    if (!project.github) {
      throw new Error('Can only add SourceUpdate to a root project');
    }

    if (options.sources.length === 0) {
      throw new Error('SourceUpdate MUST include at least 1 source. Got 0.');
    }

    super(project);

    const taskName = `update-source:${options.name}`;
    const workflowName = `update-source-${options.name}`;
    const needsS3Access = options.sources.some((s) => s.url.startsWith('s3://'));

    const updateTask = project.addTask(taskName, {
      steps: options.sources.map((s) => {
        if (s.url.startsWith('s3://')) {
          return {
            exec: `aws s3 cp ${s.url} ${s.target}`,
          };
        }
        return new DownloadScript(s.url, s.target, s.isZip);
      }),
    });
    this.updateAllTask.spawn(updateTask);

    const updateWorkflow = new github.TaskWorkflow(project.github, {
      jobId: UPDATE_JOB_ID,
      name: workflowName,
      permissions: {
        contents: github.workflows.JobPermission.READ,
        idToken: needsS3Access ? github.workflows.JobPermission.WRITE : github.workflows.JobPermission.NONE,
      },
      task: updateTask,
      preBuildSteps: [
        ...project.renderWorkflowSetup(),
        ...(needsS3Access
          ? [
              {
                name: 'Federate into AWS',
                uses: 'aws-actions/configure-aws-credentials@v2',
                with: {
                  'aws-region': 'us-east-1',
                  'role-to-assume': '${{ secrets.AWS_ROLE_TO_ASSUME }}',
                  'role-session-name': 'awscdk-service-spec',
                  'role-duration-seconds': 900,
                },
              },
            ]
          : []),
      ],
      postBuildSteps: [
        ...github.WorkflowActions.createPullRequest({
          pullRequestTitle: `feat(sources): update ${options.name}`,
          pullRequestDescription: `Updates the ${options.name} source from upstream`,
          workflowName,
          labels: ['auto-approve'],
          baseBranch: 'main',
          branchName: `update-source/${options.name}`,
        }),
      ],
    });

    updateWorkflow.on({
      workflowDispatch: {},
      schedule: [{ cron: options.schedule ?? '11 3 * * 1' }],
    });
  }

  private get updateAllTask(): Task {
    const name = 'update-sources:all';
    return this.project.tasks.tryFind(name) ?? this.project.addTask(name);
  }
}

export enum SourceProcessing {
  /**
   * No post processing is done.
   */
  NONE = 'none',
  /**
   * Extract the zip file into the directory.
   * When this is set, `options.fileName` has no effect.
   */
  EXTRACT = 'extract',
}

interface BaseSourceOptions {
  /**
   * The human friendly short name of the source.
   */
  readonly name: string;
  /**
   * The schedule this source should be updated at.
   * @default - weekly
   */
  readonly schedule?: string;
  /**
   * The directory this source is stored in.
   */
  readonly dir: string;
  /**
   * Save source as this filename.
   * @default - same filename as the source url
   */
  readonly fileName?: string;
  /**
   * Should any postprocessing be done on the source file.
   * @default SourceProcessing.NONE
   */
  postProcessing?: SourceProcessing;
}

export interface RegionalSourceOptions extends BaseSourceOptions {
  /**
   * A map of regions to source URLs
   */
  sources: { [region: string]: string };
}

export class RegionalSource extends SourceUpdate {
  public constructor(project: javascript.NodeProject, options: RegionalSourceOptions) {
    super(project, {
      ...options,
      sources: Object.entries(options.sources).map(([region, url]) =>
        getDataSource(url, {
          ...options,
          dir: path.join(options.dir, region),
        }),
      ),
    });
  }
}

export interface SingleSourceOptions extends BaseSourceOptions {
  /**
   * The URL of the source
   */
  source: string;
}

export class SingleSource extends SourceUpdate {
  public constructor(project: javascript.NodeProject, options: SingleSourceOptions) {
    super(project, {
      ...options,
      sources: [getDataSource(options.source, options)],
    });
  }
}

function getDataSource(url: string, options: BaseSourceOptions) {
  if (options.postProcessing === SourceProcessing.EXTRACT) {
    return {
      target: options.dir,
      url,
      isZip: true,
    };
  }

  return {
    target: path.join(options.dir, options.fileName ?? path.basename(url)),
    url,
    isZip: false,
  };
}
