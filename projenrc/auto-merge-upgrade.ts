import { javascript, JsonPatch } from 'projen';

export enum MergeMethod {
  SQUASH = 'squash',
  MERGE = 'merge',
  REBASE = 'rebase',
}

export interface AutoMergeUpgradeOptions {
  /**
   * Enable auto-merge only for upgrades targeting these branches.
   * @default ['main']
   */
  branches?: string[];

  /**
   * The method used to auto-merge the PR.
   * @default MergeMethod.SQUASH
   */
  mergeMethod?: MergeMethod;
}

export class AutoMergeUpgrade {
  constructor(upgradeDeps?: javascript.UpgradeDependencies, options: AutoMergeUpgradeOptions = {}) {
    if (!upgradeDeps) {
      return;
    }

    const { branches = ['main'], mergeMethod = MergeMethod.SQUASH } = options;

    this.getWorkflows(upgradeDeps, branches).forEach((workflow) => {
      workflow.file?.patch(
        JsonPatch.add('/jobs/pr/steps/-', {
          uses: 'peter-evans/enable-pull-request-automerge@v2',
          with: {
            token: '${{ secrets.PROJEN_GITHUB_TOKEN }}',
            'pull-request-number': '${{ steps.create-pr.outputs.pull-request-number }}',
            'merge-method': mergeMethod,
          },
        }),
      );
    });
  }

  private getWorkflows(upgradeDeps: javascript.UpgradeDependencies, branches: string[]) {
    if (upgradeDeps.workflows.length <= 1) {
      return upgradeDeps.workflows;
    }

    const workflowNames = branches.map((b) => `${upgradeDeps.upgradeTask.name}-${b}`);

    return upgradeDeps.workflows.filter((wf) => workflowNames.includes(wf.name));
  }
}
