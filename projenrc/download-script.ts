import { TaskOptions, TaskStep } from 'projen';

export interface DownloadOptions {
  /** Extract the downloaded zip file into the target directory */
  readonly isZip?: boolean;
  /** Save only this file of the downloaded gzipped tarball */
  readonly tarballEntry?: string;
  /** Fail unless the download has this digest, in the format of npm's dist.integrity */
  readonly integrity?: string;
}

export class DownloadScript implements TaskOptions, TaskStep {
  public get exec(): string {
    return [
      `node ./scripts/download.task.js ${this.url} ${this.target}`,
      ...(this.options.isZip ? ['--extract'] : []),
      ...(this.options.tarballEntry ? [`--tarball-entry ${this.options.tarballEntry}`] : []),
      ...(this.options.integrity ? [`--integrity ${this.options.integrity}`] : []),
    ].join(' ');
  }

  public constructor(
    private readonly url: string,
    private readonly target: string,
    private readonly options: DownloadOptions = {},
  ) {}

  public toJSON() {
    return {
      exec: this.exec,
    };
  }
}
