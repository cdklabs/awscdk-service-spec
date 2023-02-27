import { Module } from './module';
import { Scope } from './scope';
import { LocalSymbol, ObjectLike } from './statements';

export class ExternalModule extends Module {
  public constructor(fqn: string, public readonly scope: Scope) {
    super(fqn);
  }

  public import(as: string): ObjectLike {
    this.scope.addImport(this, as);
    return new (class extends LocalSymbol {})(as).asObject();
  }
}
