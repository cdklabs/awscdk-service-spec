import { TaskOptions, TaskStep } from 'projen';
import { TypeScriptWorkspace } from './workspace';
import { join, relative } from 'path';

export enum VersionMatch {
  MAJOR = 'MAJOR',
  MINOR = 'MINOR',
  EXACT = 'EXACT',
}

export class GatherVersions implements TaskOptions, TaskStep {
  public get exec(): string {
    return `ts-node ${relative(
      this.project.outdir,
      join(this.project.root.outdir, 'projenrc/gather-versions.exec.ts'),
    )} ${this.project.name} ${this.versionMatch} --deps ${this.project
      .localDependencies()
      .map((d) => d.name)
      .join(' ')}`;
  }
  public receiveArgs = true;

  public constructor(public readonly project: TypeScriptWorkspace, public readonly versionMatch: VersionMatch) {}

  public toJSON() {
    return {
      exec: this.exec,
      receiveArgs: this.receiveArgs,
    };
  }
}
