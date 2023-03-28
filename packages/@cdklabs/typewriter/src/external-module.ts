import { Module } from './module';

export class ExternalModule extends Module {
  public constructor(fqn: string, public readonly _importName?: string) {
    super(fqn);
  }

  public get importName(): string {
    return this._importName ?? super.importName;
  }
}
