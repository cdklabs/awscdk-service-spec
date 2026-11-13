import { relative } from 'node:path';
import { yarn } from 'cdklabs-projen-project-types';
import * as pj from 'projen';
import { RELEASED_DATABASE_DIR, RELEASED_DATABASE_PINS } from './released-database';

export interface TypeHistoryGateOptions {
  readonly serviceSpec: yarn.TypeScriptWorkspace;
}

const BASE_CHECKOUT = 'base-branch';
const ENTRIES_FILE = '$RUNNER_TEMP/type-mapping-entries.txt';
const ON_PULL_REQUEST = "github.event_name == 'pull_request' || github.event_name == 'merge_group'";

/**
 * Add the type history gate and the released database checks to the build job
 *
 * The build job runs for pull requests and in the merge queue. Its gate step alone writes the printed mapping
 * entries to a file, uploaded only when the gate fails, and sets the `type_gate_failed` job output.
 *
 * A change of the released database passes only if it matches the npm release of the pinned version, does not move
 * back, and the gate also passes against the base branch's released database.
 */
export class TypeHistoryGate extends pj.Component {
  public constructor(root: yarn.Monorepo, options: TypeHistoryGateOptions) {
    super(root);

    const workflow = root.github?.tryFindWorkflow('build');
    if (!workflow?.file) {
      throw new Error('The type history gate needs the build workflow');
    }
    const serviceSpecDir = relative(root.outdir, options.serviceSpec.outdir);
    const checkoutBase = pj.github.WorkflowSteps.checkout({
      name: 'Checkout base branch',
      if: ON_PULL_REQUEST,
      with: {
        ref: '${{ github.event.pull_request.base.sha || github.event.merge_group.base_sha }}',
        repository: '${{ github.repository }}',
        path: BASE_CHECKOUT,
      },
    });
    const baseReleasedDatabase = `"$GITHUB_WORKSPACE/${BASE_CHECKOUT}/${RELEASED_DATABASE_DIR}/db.json.gz"`;
    const basePins = `"$GITHUB_WORKSPACE/${BASE_CHECKOUT}/${RELEASED_DATABASE_PINS}"`;

    workflow.file.patch(
      pj.JsonPatch.add('/jobs/build/outputs/type_gate_failed', '${{ steps.type_gate.outputs.failed }}'),
      pj.JsonPatch.add('/jobs/build/steps/-', {
        name: 'Check type history',
        id: 'type_gate',
        'working-directory': serviceSpecDir,
        // type-gate writes the entries file only for undecided cases, so any other error fails the step unmarked
        run: [
          `if ! npx projen type-gate --entries-file "${ENTRIES_FILE}"; then`,
          `  if [ -f "${ENTRIES_FILE}" ]; then`,
          '    echo "failed=true" >> $GITHUB_OUTPUT',
          '  fi',
          '  exit 1',
          'fi',
        ].join('\n'),
      }),
      pj.JsonPatch.add(
        '/jobs/build/steps/-',
        pj.github.WorkflowSteps.uploadArtifact({
          name: 'Upload type mapping entries',
          if: "failure() && steps.type_gate.outputs.failed == 'true'",
          with: {
            name: 'type-mapping-entries',
            path: '${{ runner.temp }}/type-mapping-entries.txt',
          },
        }),
      ),
      pj.JsonPatch.add('/jobs/build/steps/-', {
        ...checkoutBase,
        // The next steps run code from the change, and the public repository serves the base branch's released
        // database from LFS without a token
        with: { ...checkoutBase.with, 'persist-credentials': false },
      }),
      pj.JsonPatch.add('/jobs/build/steps/-', {
        name: 'Check released database',
        id: 'released_database',
        if: ON_PULL_REQUEST,
        // Empty in the merge queue, whose head already contains the base branch
        env: { PULL_REQUEST: '${{ github.event.pull_request.number }}' },
        run: `node scripts/check-released-database-bump.js ${BASE_CHECKOUT}`,
      }),
      pj.JsonPatch.add('/jobs/build/steps/-', {
        name: 'Pull the base branch released database',
        if: "steps.released_database.outputs.base-baseline == 'true'",
        run: `git -C ${BASE_CHECKOUT} lfs pull --include=${RELEASED_DATABASE_DIR}/db.json.gz`,
      }),
      pj.JsonPatch.add('/jobs/build/steps/-', {
        name: 'Check type history against the base branch released database',
        if: "steps.released_database.outputs.base-baseline == 'true'",
        'working-directory': serviceSpecDir,
        run: `npx projen type-gate --snapshot ${baseReleasedDatabase} --pins ${basePins}`,
      }),
    );
  }
}
