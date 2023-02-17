import { Component, Project } from "projen";

export interface GitLfsProps {
  /**
   * Patterns that identify text files that should be tracked in Git LFS
   */
  readonly patterns?: string[];
}

export class GitLfs extends Component {
  constructor(project: Project, props: GitLfsProps) {
    super(project);

    for (const textFile of props.patterns ?? []) {
      project.gitattributes.addAttributes(textFile,
        'filter=lfs',
        'diff=lfs',
        'merge=lfs',
        '-text',
      );
    }
  }
}