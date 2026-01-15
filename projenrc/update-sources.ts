import { Component, Task, github, javascript } from 'projen';
import { DownloadScript } from './download-script';
import * as path from 'path';

const UPDATE_JOB_ID = 'update_source';

interface DataSource {
  url?: string;
  target: string;
  isZip?: boolean;
  scriptPath?: string;
}

export class Role {
  public static fromGitHubSecret(secret: string): string {
    return `\${{ secrets.${secret} }}`;
  }
}

export interface AwsAuthentication {
  region: string;
  roleToAssume: string;
  roleSessionName: string;
  roleDurationSeconds?: number;
}

export interface SourceUpdateOptions {
  readonly name: string;
  readonly sources: DataSource[];
  readonly schedule?: string;
  readonly awsAuth?: AwsAuthentication;
}

abstract class SourceUpdate extends Component {
  public readonly task: Task;
  public readonly workflow: github.TaskWorkflow;

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
    const needsS3Access = options.sources.some((s) => s.url?.startsWith('s3://'));

    if (needsS3Access && !options.awsAuth) {
      throw new Error('S3 source detected. Must provide `awsAuth` option.');
    }

    this.task = project.addTask(taskName, {
      steps: options.sources.map((s) => {
        if (s.scriptPath && s.url) {
          throw new Error('DataSource must have only url or scriptPath, but not both');
        }
        if (s.scriptPath) {
          // Use ts-node for .ts files, node for .js files
          const executor = s.scriptPath.endsWith('.ts') ? 'ts-node' : 'node';
          return {
            exec: `${executor} ${s.scriptPath} ${s.target}`,
          };
        }
        if (s.url && s.url.startsWith('s3://')) {
          return {
            exec: `aws s3 cp ${s.url} ${s.target}`,
          };
        }
        if (s.url) {
          return new DownloadScript(s.url, s.target, s.isZip);
        }
        throw new Error('DataSource must have either url or scriptPath');
      }),
    });
    this.updateAllTask.spawn(this.task);

    this.workflow = new github.TaskWorkflow(project.github, {
      jobId: UPDATE_JOB_ID,
      name: workflowName,
      permissions: {
        contents: github.workflows.JobPermission.READ,
        idToken: needsS3Access ? github.workflows.JobPermission.WRITE : github.workflows.JobPermission.NONE,
        pullRequests: github.workflows.JobPermission.WRITE,
      },
      task: this.task,
      preBuildSteps: [
        ...project.renderWorkflowSetup(),
        ...(needsS3Access && options.awsAuth
          ? [
              {
                name: 'Federate into AWS',
                uses: 'aws-actions/configure-aws-credentials@v2',
                with: {
                  'aws-region': options.awsAuth.region,
                  'role-to-assume': options.awsAuth.roleToAssume,
                  'role-session-name': options.awsAuth.roleSessionName,
                  'role-duration-seconds': options.awsAuth.roleDurationSeconds,
                },
              },
            ]
          : []),
      ],
      postBuildSteps: [
        ...github.WorkflowActions.createPullRequest({
          pullRequestTitle: `feat(sources): update ${options.name}`,

          pullRequestDescription: [
            '> ⚠️ This Pull Request updates daily and will overwrite **all** manual changes pushed to the branch',
            '',
            `Updates the ${options.name} source from upstream`,
          ].join('\n'),
          workflowName,
          credentials: project.github.projenCredentials,
          labels: ['auto-approve'],
          baseBranch: 'main',
          branchName: `update-source/${options.name}`,
        }),
        {
          if: '${{ steps.create-pr.outputs.pull-request-number }}',
          env: {
            GH_TOKEN: '${{ github.token }}',
          },
          name: 'add-instructions',
          run:
            `echo -e "${[
              '**To work on this Pull Request, please create a new branch and PR. This prevents your work from being deleted by the automation.**',
              '',
              'Run the following commands inside the repo:',
              '\\`\\`\\`console',
              'gh co ${{ steps.create-pr.outputs.pull-request-number }}',
              'git switch -c fix-pr-${{ steps.create-pr.outputs.pull-request-number }} && git push -u origin HEAD',
              'gh pr create -t \\"fix: PR #${{ steps.create-pr.outputs.pull-request-number }}\\" --body \\"Fixes ${{ steps.create-pr.outputs.pull-request-url }}\\"',
              '\\`\\`\\`',
            ].join('\\n')}"` + '| gh pr comment ${{ steps.create-pr.outputs.pull-request-number }} -F-',
        },
      ],
    });

    this.workflow.on({
      workflowDispatch: {},
      schedule: [{ cron: options.schedule ?? '11 3 * * 1-5' }],
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
  readonly postProcessing?: SourceProcessing;
  /**
   * AWS Authentication config.
   * Required with S3 sources.
   */
  readonly awsAuth?: AwsAuthentication;
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

export interface ScriptSourceOptions {
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
   * Path to the JavaScript file that will fetch the source.
   * The script is responsible for downloading/generating the source data.
   */
  readonly scriptPath: string;
  /**
   * The directory this source is stored in.
   */
  readonly dir: string;
  /**
   * AWS Authentication config.
   * Required if the script needs AWS access.
   */
  readonly awsAuth?: AwsAuthentication;
}

export class ScriptSource extends SourceUpdate {
  public constructor(project: javascript.NodeProject, options: ScriptSourceOptions) {
    super(project, {
      ...options,
      sources: [
        {
          scriptPath: options.scriptPath,
          target: options.dir,
        },
      ],
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
