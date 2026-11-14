import * as pj from 'projen';
import { yarn } from 'cdklabs-projen-project-types';
import { relative } from 'node:path';

/** thollander/actions-comment-pull-request at v3.0.1 */
const COMMENT_PULL_REQUEST_ACTION = 'thollander/actions-comment-pull-request@24bffb9b452ba05a4f3f77933840a6a841d1b32b';

export interface DiffDbOptions {
  readonly workflowRunsOn: string[];
  readonly serviceSpec: yarn.TypeScriptWorkspace;
  readonly serviceSpecImporters: yarn.TypeScriptWorkspace;
}

export class DiffDb extends pj.Component {
  private readonly root: yarn.Monorepo;
  private readonly workflow: pj.github.GithubWorkflow;
  private readonly serviceSpec: yarn.TypeScriptWorkspace;
  private readonly importers: yarn.TypeScriptWorkspace;
  private readonly workflowRunsOn: string[];

  public constructor(root: yarn.Monorepo, options: DiffDbOptions) {
    super(root);

    this.root = root;
    this.workflow = root.github?.tryFindWorkflow('build')!;
    this.serviceSpec = options.serviceSpec;
    this.importers = options.serviceSpecImporters;
    this.workflowRunsOn = options.workflowRunsOn;

    this.uploadHeadDatabase();
    this.checkInputFields();
    this.buildBaseDatabase();
    this.diffDatabase();
  }

  private path(path: string) {
    return relative(this.project.outdir, path);
  }

  private get diffDb() {
    return this.path(this.importers.outdir + '/bin/diff-db');
  }

  private uploadHeadDatabase() {
    this.workflow.file?.patch(
      pj.JsonPatch.add(
        '/jobs/build/steps/-',
        pj.github.WorkflowSteps.uploadArtifact({
          name: 'Upload head database',
          with: {
            name: 'db.head.json.gz',
            path: this.path(this.serviceSpec.outdir + '/db.json.gz'),
          },
        }),
      ),
    );
  }

  /**
   * Fail the build when the L1 misses a field that CloudFormation accepts as input
   *
   * In the build job, so that the check also runs in the merge queue, where the diff-db job does not run.
   */
  private checkInputFields() {
    this.workflow.file?.patch(
      pj.JsonPatch.add('/jobs/build/steps/-', {
        name: 'Check L1 input fields',
        'working-directory': this.path(this.serviceSpec.outdir),
        run: 'npx projen check-input-fields',
      }),
    );
  }

  private buildBaseDatabase() {
    this.workflow.addJob('base-database', {
      runsOn: this.workflowRunsOn,
      env: { CI: 'true' },
      permissions: {},
      if: "github.event_name == 'pull_request' || github.event_name == 'pull_request_target'",
      steps: [
        pj.github.WorkflowSteps.checkout({
          name: 'Checkout',
          with: {
            ref: '${{ github.event.pull_request.base.ref }}',
            repository: '${{ github.event.pull_request.base.repo.full_name }}',
            lfs: true,
          },
        }),
        ...this.root.renderWorkflowSetup(),
        {
          name: 'Build base database',
          run: `yarn exec nx run ${this.serviceSpec.name}:compile`,
        },
        pj.github.WorkflowSteps.uploadArtifact({
          name: 'Upload base database',
          with: {
            name: 'db.base.json.gz',
            path: this.path(this.serviceSpec.outdir + '/db.json.gz'),
          },
        }),
      ],
    });
  }

  private diffDatabase() {
    this.workflow.addJob('diff-db', {
      needs: ['build', 'base-database'],
      if: "!(needs.build.outputs.self_mutation_happened) && (github.event_name == 'pull_request' || github.event_name == 'pull_request_target')",
      runsOn: this.workflowRunsOn,
      env: { CI: 'true' },
      permissions: {
        contents: pj.github.workflows.JobPermission.WRITE,
        idToken: pj.github.workflows.JobPermission.NONE,
        pullRequests: pj.github.workflows.JobPermission.WRITE,
      },
      steps: [
        pj.github.WorkflowSteps.checkout({
          name: 'Checkout',
          with: {
            ref: '${{ github.event.pull_request.head.ref }}',
            repository: '${{ github.event.pull_request.head.repo.full_name }}',
            // The L1 input field check reads the CloudFormation schemas
            lfs: true,
          },
        }),
        ...this.root.renderWorkflowSetup(),
        {
          name: 'Build diff-db',
          run: `yarn exec nx run ${this.importers.name}:compile`,
        },
        pj.github.WorkflowSteps.downloadArtifact({
          name: 'Download base database',
          with: {
            name: 'db.base.json.gz',
            path: 'base',
          },
        }),
        pj.github.WorkflowSteps.downloadArtifact({
          name: 'Download head database',
          with: {
            name: 'db.head.json.gz',
            path: 'head',
          },
        }),
        {
          name: 'Diff databases',
          id: 'diff-db',
          continueOnError: true,
          run: `${this.diffDb} base/db.json.gz head/db.json.gz > DIFF || echo "diff-result=true" >> $GITHUB_OUTPUT`,
        },
        {
          // Only reports: CDK accepts the L1 changes that CloudFormation makes, like renamed or merged structs
          name: 'Report L1 changes',
          run: [
            `if ! ${this.diffDb} --l1-changes base/db.json.gz head/db.json.gz > L1-CHANGES; then`,
            '  echo "The L1 change report failed, see the job log." > L1-CHANGES',
            'fi',
            'cat L1-CHANGES',
          ].join('\n'),
        },
        {
          // A failure is recorded here and fails the job in the last step, after the report is posted
          name: 'Check L1 input fields',
          id: 'l1-input-fields',
          workingDirectory: this.path(this.serviceSpec.outdir),
          run: [
            'if ! npx projen check-input-fields "$GITHUB_WORKSPACE/head/db.json.gz" > "$GITHUB_WORKSPACE/L1-INPUT-FIELDS"; then',
            '  echo "failed=true" >> $GITHUB_OUTPUT',
            'fi',
            'cat "$GITHUB_WORKSPACE/L1-INPUT-FIELDS"',
          ].join('\n'),
        },
        pj.github.WorkflowSteps.uploadArtifact({
          name: 'Upload diff',
          if: 'steps.diff-db.outputs.diff-result',
          with: {
            name: 'db-diff-${{ github.event.pull_request.head.sha }}',
            path: 'DIFF',
          },
        }),
        {
          name: 'Create PR.md',
          if: 'steps.diff-db.outputs.diff-result',
          env: {
            DIFF_LIMIT: String(200_000), // @see https://github.com/dead-claudia/github-limits?tab=readme-ov-file#pr-body
            // Pass GitHub context through env vars instead of interpolating
            // `${{ ... }}` expressions directly into the shell script (flagged by
            // cdklabs-projen-project-types' CheckGhaExpressions).
            REPOSITORY: '${{ github.repository }}',
            RUN_ID: '${{ github.run_id }}',
          },
          run: [
            'if [ $(wc -c < DIFF) -gt $DIFF_LIMIT ]; then',
            '  echo "> [!WARNING]" >> PR.md',
            '  echo "> Diff too large for inline display. Download the full diff using the link below." >> PR.md',
            '  echo "" >> PR.md',
            'fi',
            `echo '**${this.serviceSpec.name}**: Model database diff detected' >> PR.md`,
            "echo '```' >> PR.md",
            'cat L1-CHANGES >> PR.md',
            'echo "" >> PR.md',
            'cat L1-INPUT-FIELDS >> PR.md',
            "echo '```' >> PR.md",
            'echo "[📁 Download full diff](https://github.com/${REPOSITORY}/actions/runs/${RUN_ID})" >> PR.md',
            "echo '```' >> PR.md",
            'head -c $DIFF_LIMIT DIFF >> PR.md',
            'if [ $(wc -c < DIFF) -gt $DIFF_LIMIT ]; then',
            '  echo "" >> PR.md',
            '  echo "... (truncated)" >> PR.md',
            'fi',
            "echo '```' >> PR.md",
          ].join('\n'),
        },
        {
          name: 'Comment diff',
          if: 'steps.diff-db.outputs.diff-result',
          uses: COMMENT_PULL_REQUEST_ACTION,
          with: {
            'comment-tag': 'diff-db',
            mode: 'recreate',
            'file-path': 'PR.md',
          },
        },
        {
          name: 'Delete outdated diff',
          if: '!(steps.diff-db.outputs.diff-result)',
          uses: COMMENT_PULL_REQUEST_ACTION,
          with: {
            'comment-tag': 'diff-db',
            message: `**${this.serviceSpec.name}**: No model change detected`,
            mode: 'upsert',
          },
        },
        {
          // Also runs when posting the comment failed
          name: 'Fail on missing L1 input fields',
          if: '!cancelled() && steps.l1-input-fields.outputs.failed',
          run: [
            'echo "::error::The L1 misses fields that CloudFormation accepts as input, or the check did not run."',
            'cat L1-INPUT-FIELDS',
            'exit 1',
          ].join('\n'),
        },
      ],
    });
  }
}
