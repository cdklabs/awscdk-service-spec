import { github as gh, Component } from 'projen';

export enum MergeMethod {
  SQUASH = 'squash',
  MERGE = 'merge',
  REBASE = 'rebase'
}

/**
 * Options for 'AutoMerge'
 */
export interface AutoMergeOptions {
  /**
   * Only pull requests authored by these Github usernames will have auto-merge enabled.
   * @default - pull requests from all users are eligible for auto-merge
   */
  readonly allowedUsernames?: string[];

  /**
   * Only pull requests with one of this labels will have auto-merge enabled.
   * @default - all pull requests are eligible for auto-merge
   */
  readonly labels?: string[];

  /**
   * A GitHub secret name which contains a GitHub Access Token
   * with write permissions for the `pull_request` scope.
   *
   * This token is used to enable auto-merge on pull requests.
   *
   * @default "GITHUB_TOKEN"
   */
  readonly secret?: string;

  /**
   * The method used to auto-merge the PR.
   * Any branch protection rules must allow this merge method.
   * @default MergeMethod.SQUASH
   */
  readonly mergeMethod?: MergeMethod;  

  /**
   * Github Runner selection labels
   * @default ["ubuntu-latest"]
   */
  readonly runsOn?: string[];
}

/**
 * Merge pull requests using a merge queue
 */
export class AutoMerge extends Component {
  constructor(github: gh.GitHub, options: AutoMergeOptions = {}) {
    super(github.project);

    const labels = options.labels ?? [];
    const usernames = options.allowedUsernames ?? [];

    const conditions: string[] = [];
    if (labels.length > 0) {
      conditions.push(
        '(' + labels.map((l) => `contains(github.event.pull_request.labels.*.name, '${l}')`).join(' || ') + ')',
      );
    }
    if (usernames.length > 0) {
      conditions.push('(' + usernames.map((u) => `github.event.pull_request.user.login == '${u}'`).join(' || ') + ')');
    }

    const secret = options.secret ?? 'GITHUB_TOKEN';
    const mergeMethod = options.mergeMethod ?? MergeMethod.SQUASH;

    const autoMergeJob: gh.workflows.Job = {
      name: "Set AutoMerge on PR #${{ github.event.number }}",
      runsOn: options.runsOn ?? ['ubuntu-latest'],
      permissions: {
        pullRequests: gh.workflows.JobPermission.WRITE,
      },
      if: conditions.length ? conditions.join(' && ') : undefined,
      steps: [
        {
          uses: 'peter-evans/enable-pull-request-automerge@v2',
          with: {
            'token': `\${{ secrets.${secret} }}`,
            'pull-request-number': '${{ github.event.number }}',
            'merge-method': mergeMethod,
          },
        },
      ],
    };

    const workflow = github.addWorkflow('auto-merge');
    workflow.on({
      // The 'pull request' event gives the workflow 'read-only' permissions on some
      // pull requests (such as the ones from dependabot) when using the `GITHUB_TOKEN`
      // security token. This prevents the workflow from approving these pull requests.
      // Github has placed this guard so as to prevent security attacks by simply opening
      // a pull request and triggering a workflow on a commit that was not vetted to make
      // unintended changes to the repository.
      //
      // Instead use the 'pull request target' event here that gives the Github workflow
      // 'read-write' permissions. This is safe because, this event, unlike the 'pull request'
      // event references the BASE commit of the pull request and not the HEAD commit.
      //
      // We only enable auto-merge when a PR is opened, reopened or moving from Draft to Ready.
      // That way a user can always disable auto-merge if they want to and the workflow will
      // not automatically re-enable it, unless one of the events occurs.
      pullRequestTarget: {
        types: ['opened', 'reopened', 'ready_for_review'],
      },
    });
    workflow.addJobs({ enableAutoMerge: autoMergeJob });
  }
}
