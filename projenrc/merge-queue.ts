import { javascript, Component} from 'projen';
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

    project.github?.tryFindWorkflow("build")?.on({
      'push': {
        branches: [
          "gh-readonly-queue/main/*"
        ]
      }
    } as any);

    if (autoMerge && project.github) {
      new AutoMerge(project.github, options.autoMergeOptions)
    }
  }
}
