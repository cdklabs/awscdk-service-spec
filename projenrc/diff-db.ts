import * as pj from 'projen';
import { yarn } from 'cdklabs-projen-project-types';
import { relative } from 'node:path';

export interface DiffDbOptions {
  readonly workflowRunsOn: string[];
  readonly serviceSpec: yarn.TypeScriptWorkspace;
  readonly serviceSpecImporters: yarn.TypeScriptWorkspace;
}

export class DiffDb extends pj.Component {
  private readonly workflow: pj.github.GithubWorkflow;
  private readonly serviceSpec: yarn.TypeScriptWorkspace;
  private readonly importers: yarn.TypeScriptWorkspace;
  private readonly workflowRunsOn: string[];

  public constructor(root: yarn.Monorepo, options: DiffDbOptions) {
    super(root);

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
        {
          name: 'Checkout',
          uses: 'actions/checkout@v3',
          with: {
            ref: '${{ github.event.pull_request.base.ref }}',
            repository: '${{ github.event.pull_request.base.repo.full_name }}',
            lfs: true,
          },
        },
        {
          name: 'Install dependencies',
          run: 'yarn install --check-files',
        },
        {
          name: 'Build base database',
          workingDirectory: this.path(this.serviceSpec.outdir),
          run: 'npx projen nx compile',
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
        {
          name: 'Checkout',
          uses: 'actions/checkout@v3',
          with: {
            ref: '${{ github.event.pull_request.head.ref }}',
            repository: '${{ github.event.pull_request.head.repo.full_name }}',
            lfs: false,
          },
        },
        {
          name: 'Install dependencies',
          run: 'yarn install --check-files',
        },
        {
          name: 'Build diff-db',
          workingDirectory: this.path(this.importers.outdir),
          run: 'npx projen nx compile',
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
          run: `${this.path(
            this.importers.outdir + '/bin/diff-db',
          )} base/db.json.gz head/db.json.gz > DIFF || echo "diff-result=true" >> $GITHUB_OUTPUT`,
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
          },
          run: [
            'if [ $(wc -c < DIFF) -gt $DIFF_LIMIT ]; then',
            '  echo "> [!WARNING]" >> PR.md',
            '  echo "> Diff too large for inline display. Download the full diff using the link below." >> PR.md',
            '  echo "" >> PR.md',
            'fi',
            `echo '**${this.serviceSpec.name}**: Model database diff detected' >> PR.md`,
            'echo "[📁 Download full diff](https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }})" >> PR.md',
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
