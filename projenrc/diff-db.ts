import * as pj from 'projen';
import { yarn } from 'cdklabs-projen-project-types';
import { relative } from 'node:path';

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
            lfs: false,
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
          // Informational: a failed report does not fail the job
          name: 'Report L1 changes',
          run: [
            `if ! ${this.diffDb} --l1-changes base/db.json.gz head/db.json.gz > L1-CHANGES; then`,
            '  echo "The L1 change report failed, see the job log." > L1-CHANGES',
            'fi',
            'cat L1-CHANGES',
          ].join('\n'),
        },
        {
          // Informational, as above
          name: 'List breaking changes',
          run: [
            `if ! ${this.diffDb} --breaking-changes base/db.json.gz head/db.json.gz > BREAKING-CHANGES; then`,
            '  echo "The breaking change list failed, see the job log." > BREAKING-CHANGES',
            'fi',
            'cat BREAKING-CHANGES',
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
            // Bytes for all of PR.md; GitHub takes up to 262,144 bytes in a comment
            // @see https://github.com/dead-claudia/github-limits?tab=readme-ov-file#issue-comments
            DIFF_LIMIT: String(200_000),
            // Pass GitHub context through env vars instead of interpolating
            // `${{ ... }}` expressions directly into the shell script (flagged by
            // cdklabs-projen-project-types' CheckGhaExpressions).
            REPOSITORY: '${{ github.repository }}',
            RUN_ID: '${{ github.run_id }}',
          },
          run: [
            '{',
            `  echo '**${this.serviceSpec.name}**: Model database diff detected'`,
            "  echo '```'",
            '  cat L1-CHANGES',
            "  echo '```'",
            "  echo '**Breaking changes** (changelog text):'",
            "  echo '```'",
            '  cat BREAKING-CHANGES',
            "  echo '```'",
            '  echo "[📁 Download full diff](https://github.com/${REPOSITORY}/actions/runs/${RUN_ID})"',
            "  echo '```'",
            '} > PR-PARTS',
            "WARNING=$'> [!WARNING]\\n> Diff too large for inline display. Download the full diff using the link below.\\n\\n'",
            "MARKER=$'\\n... (truncated)\\n'",
            "FENCE=$'```\\n'",
            '# Only the model diff is shortened, to what the limit leaves after the other parts',
            'BUDGET=$(( DIFF_LIMIT - $(wc -c < PR-PARTS) - ${#FENCE} ))',
            'if [ $(wc -c < DIFF) -le $BUDGET ]; then',
            '  { cat PR-PARTS DIFF; printf %s "$FENCE"; } > PR.md',
            'else',
            '  BUDGET=$(( BUDGET - ${#WARNING} - ${#MARKER} ))',
            '  { printf %s "$WARNING"; cat PR-PARTS; head -c $(( BUDGET > 0 ? BUDGET : 0 )) DIFF; printf %s "$MARKER$FENCE"; } > PR.md',
            'fi',
          ].join('\n'),
        },
        {
          name: 'Comment diff',
          if: 'steps.diff-db.outputs.diff-result',
          uses: 'thollander/actions-comment-pull-request@v3',
          with: {
            'comment-tag': 'diff-db',
            mode: 'recreate',
            'file-path': 'PR.md',
          },
        },
        {
          name: 'Delete outdated diff',
          if: '!(steps.diff-db.outputs.diff-result)',
          uses: 'thollander/actions-comment-pull-request@v3',
          with: {
            'comment-tag': 'diff-db',
            message: `**${this.serviceSpec.name}**: No model change detected`,
            mode: 'upsert',
          },
        },
      ],
    });
  }
}
