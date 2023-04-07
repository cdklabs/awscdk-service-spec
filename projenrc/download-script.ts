import { TaskOptions, TaskStep } from 'projen';

export class DownloadScript implements TaskOptions, TaskStep {
  public get exec(): string {
    return `node ./scripts/download.task.js ${this.url} ${this.target} ${this.isZip ? '--extract' : ''}`.trimEnd();
  }

  public constructor(private readonly url: string, private readonly target: string, private readonly isZip = false) {}

  public toJSON() {
    return {
      exec: this.exec,
    };
  }
}
