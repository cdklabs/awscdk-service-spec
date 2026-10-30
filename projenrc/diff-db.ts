import * as pj from 'projen';
import { yarn } from 'cdklabs-projen-project-types';
import { relative } from 'node:path';

export interface DiffDbOptions {
  readonly workflowRunsOn: string[];
  readonly serviceSpec: yarn.TypeScriptWorkspace;
  readonly serviceSpecImporters: yarn.TypeScriptWorkspace;
  /**
   * The directory with the released database (`db.json.gz`) and its version (`VERSION`) that the L1 compatibility
   * check compares the head database with
   */
  readonly releasedDatabaseDir: string;
  /**
   * The sha256 of the released database file; the build fails if the checked-in file has another one
   */
  readonly releasedDatabaseSha256: string;
}

export class DiffDb extends pj.Component {
  private readonly root: yarn.Monorepo;
  private readonly workflow: pj.github.GithubWorkflow;
  private readonly serviceSpec: yarn.TypeScriptWorkspace;
  private readonly importers: yarn.TypeScriptWorkspace;
  private readonly workflowRunsOn: string[];
  private readonly releasedDatabaseDir: string;
  private readonly releasedDatabaseSha256: string;

  public constructor(root: yarn.Monorepo, options: DiffDbOptions) {
    super(root);

    this.root = root;
    this.workflow = root.github?.tryFindWorkflow('build')!;
    this.serviceSpec = options.serviceSpec;
    this.importers = options.serviceSpecImporters;
    this.workflowRunsOn = options.workflowRunsOn;
    this.releasedDatabaseDir = options.releasedDatabaseDir;
    this.releasedDatabaseSha256 = options.releasedDatabaseSha256;

    this.uploadHeadDatabase();
    this.checkL1Compatibility();
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
      // The diff-db job checks out without LFS, so it gets the released database from here
      pj.JsonPatch.add(
        '/jobs/build/steps/-',
        pj.github.WorkflowSteps.uploadArtifact({
          name: 'Upload released database',
          with: {
            name: 'db.released.json.gz',
            path: `${this.releasedDatabaseDir}/db.json.gz`,
          },
        }),
      ),
    );
  }

  /**
   * Fail the build job, which runs for pull requests and in the merge queue, on lost type history
   */
  private checkL1Compatibility() {
    const released = `${this.releasedDatabaseDir}/db.json.gz`;
    const headDatabase = this.path(this.serviceSpec.outdir + '/db.json.gz');
    const baseCheckout = 'base-branch';
    const baseReleasedDir = `${baseCheckout}/${this.releasedDatabaseDir}`;
    const onBaseBranch = "github.event_name == 'pull_request' || github.event_name == 'merge_group'";

    this.workflow.file?.patch(
      pj.JsonPatch.add('/jobs/build/steps/-', {
        name: 'Verify released database',
        run: [
          `if ! echo "${this.releasedDatabaseSha256}  ${released}" | sha256sum --check --strict; then`,
          `  echo "::error::${released} does not have the sha256 that .projenrc.ts pins in RELEASED_SERVICE_SPEC_SHA256. Update the version, the integrity and the sha256 together, see README.md."`,
          '  exit 1',
          'fi',
        ].join('\n'),
      }),
      pj.JsonPatch.add('/jobs/build/steps/-', {
        name: 'Check L1 compatibility',
        run: `${this.diffDb} --l1-compat ${released} ${headDatabase}`,
      }),
      // A change of the released database also changes the baseline of the check above
      pj.JsonPatch.add(
        '/jobs/build/steps/-',
        pj.github.WorkflowSteps.checkout({
          name: 'Checkout base branch',
          if: onBaseBranch,
          with: {
            ref: '${{ github.event.pull_request.base.sha || github.event.merge_group.base_sha }}',
            repository: '${{ github.repository }}',
            path: baseCheckout,
          },
        }),
      ),
      pj.JsonPatch.add('/jobs/build/steps/-', {
        name: 'Check L1 compatibility with the base branch released database',
        if: onBaseBranch,
        run: [
          `if [ ! -f ${baseReleasedDir}/db.json.gz ]; then`,
          '  echo "The base branch has no released database to compare with."',
          'else',
          `  git -C ${baseCheckout} lfs pull --include=${released}`,
          `  if cmp -s ${baseReleasedDir}/db.json.gz ${released}; then`,
          '    echo "The released database is the same as on the base branch."',
          '  else',
          `    ${this.releasedDatabaseChange(baseReleasedDir, released)}`,
          `    ${this.diffDb} --l1-compat ${baseReleasedDir}/db.json.gz ${headDatabase}`,
          '  fi',
          'fi',
        ].join('\n'),
      }),
    );
  }

  /**
   * A shell command that names the versions and sha256s of the released databases of the base branch and this change
   */
  private releasedDatabaseChange(baseReleasedDir: string, headReleasedDatabase: string) {
    const sha256 = (file: string) => `$(sha256sum < ${file} | cut -d ' ' -f 1)`;
    const base = `$(cat ${baseReleasedDir}/VERSION) (sha256 ${sha256(`${baseReleasedDir}/db.json.gz`)})`;
    const head = `$(cat ${this.releasedDatabaseDir}/VERSION) (sha256 ${sha256(headReleasedDatabase)})`;
    return [
      `echo "The released database changed from ${base} on the base branch to ${head} in this change.`,
      'Compared with the released database of the base branch:"',
    ].join(' ');
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
        {
          name: 'Collect base released database',
          run: [
            'mkdir -p base-released',
            `if [ -f ${this.releasedDatabaseDir}/db.json.gz ]; then`,
            `  cp ${this.releasedDatabaseDir}/db.json.gz ${this.releasedDatabaseDir}/VERSION base-released/`,
            'else',
            '  echo none > base-released/VERSION',
            'fi',
          ].join('\n'),
        },
        pj.github.WorkflowSteps.uploadArtifact({
          name: 'Upload base released database',
          with: {
            name: 'db.base-released',
            path: 'base-released',
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
        pj.github.WorkflowSteps.downloadArtifact({
          name: 'Download released database',
          with: {
            name: 'db.released.json.gz',
            path: 'released',
          },
        }),
        pj.github.WorkflowSteps.downloadArtifact({
          name: 'Download base released database',
          with: {
            name: 'db.base-released',
            path: 'base-released',
          },
        }),
        {
          name: 'Diff databases',
          id: 'diff-db',
          continueOnError: true,
          run: `${this.diffDb} base/db.json.gz head/db.json.gz > DIFF || echo "diff-result=true" >> $GITHUB_OUTPUT`,
        },
        {
          // Failures are recorded here and fail the job in the last step, after the report is posted
          name: 'Check L1 compatibility',
          id: 'l1-compat',
          run: [
            `${this.diffDb} --l1-compat released/db.json.gz head/db.json.gz > L1-COMPAT || echo "l1-compat-failed=true" >> $GITHUB_OUTPUT`,
            'cat L1-COMPAT',
          ].join('\n'),
        },
        {
          // A pull request that changes the released database also changes the baseline of the check above
          name: 'Check L1 compatibility with the base branch released database',
          id: 'l1-compat-base',
          run: [
            'if [ ! -f base-released/db.json.gz ]; then',
            '  echo "The base branch has no released database to compare with." > L1-COMPAT-BASE',
            'elif cmp -s base-released/db.json.gz released/db.json.gz; then',
            '  touch L1-COMPAT-BASE',
            'else',
            `  ${this.releasedDatabaseChange('base-released', 'released/db.json.gz')} > L1-COMPAT-BASE`,
            `  ${this.diffDb} --l1-compat base-released/db.json.gz head/db.json.gz >> L1-COMPAT-BASE || echo "l1-compat-failed=true" >> $GITHUB_OUTPUT`,
            '  echo "" >> L1-COMPAT-BASE',
            'fi',
            'cat L1-COMPAT-BASE',
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
            'cat L1-COMPAT-BASE L1-COMPAT >> PR.md',
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
        {
          // Also runs when posting the comment failed
          name: 'Fail on lost type history',
          if: '!cancelled() && (steps.l1-compat.outputs.l1-compat-failed || steps.l1-compat-base.outputs.l1-compat-failed)',
          run: [
            'echo "::error::The L1 compatibility check failed: the new database lost released type names or fields, or the check did not run."',
            'cat L1-COMPAT-BASE L1-COMPAT',
            'exit 1',
          ].join('\n'),
        },
      ],
    });
  }
}
