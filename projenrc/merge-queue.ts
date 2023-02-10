import { javascript, Component, JsonPatch } from 'projen';
import { AutoMerge, AutoMergeOptions } from './auto-merge';

/**
 * Options for 'MergeQueue'
 */
export interface MergeQueueOptions {
  /**
   * Should pull requests be merged automatically once they pass required checks
   * @default true
   */
  readonly autoMerge?: boolean;

  /**
   * Configure auto merge pull requests
   * @default - see AutoMergeOptions
   */
  readonly autoMergeOptions?: AutoMergeOptions;
}

/**
 * Merge pull requests using a merge queue
 */
export class MergeQueue extends Component {
  constructor(project: javascript.NodeProject, options: MergeQueueOptions = {}) {
    super(project);

    const autoMerge = options.autoMerge ?? true;
    if (autoMerge && project.github) {
      new AutoMerge(project.github, options.autoMergeOptions);
    }

    const buildWorkflow = project.github?.tryFindWorkflow('build');
    buildWorkflow?.file?.patch(JsonPatch.remove('/on/pull_request'));
    buildWorkflow?.on({
      pullRequestTarget: {},
      push: {
        branches: ['gh-readonly-queue/main/*'],
      },
    });

    // Do not require PR validation on merge queue
    project.github
      ?.tryFindWorkflow('pull-request-lint')
      ?.file?.addOverride('jobs.validate.if', '${{ github.event_name == "pull_request" }} ');
  }
}
