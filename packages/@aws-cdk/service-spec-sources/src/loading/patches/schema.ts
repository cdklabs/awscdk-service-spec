import { JsonPatch } from './json-patch';

export class Schema {
  private readonly _reports: Report[] = [];
  private readonly _patches: JsonPatch[] = [];
  public constructor(public readonly schema: any) {}

  public applyPatches() {
    JsonPatch.apply(this.schema, ...this._patches);
  }

  public patch(patch: JsonPatch) {
    this._patches.push(patch);
  }

  public report(report: Report) {
    this._reports.push(report);
  }

  public get reports() {
    return this._reports;
  }

  public get patches() {
    return this._patches;
  }
}

export interface Report {
  readonly name: string;
  readonly message: string;
  readonly data: string;
}
