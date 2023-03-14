import { Expression } from './expression';
import { NewExpression } from './expressions';
import { MemberType } from './member-type';
import { PropertySpec } from './property';
import { Scope } from './scope';
import { SymbolKind } from './symbol';
import { Type } from './type';
import { TypeSpec } from './type-declaration';
import { Initializer, InitializerSpec } from './type-member';

export interface ClassSpec extends TypeSpec {
  export?: boolean;
  properties?: PropertySpec[];
  abstract?: boolean;
  extends?: Type;
  implements?: Type[];
}

export class ClassType extends MemberType {
  public readonly kind = SymbolKind.Class;

  /**
   * List the modifiers of the interface
   */
  public get modifiers(): Array<string> {
    const modifiers = [];

    if (this.spec.export) {
      modifiers.push('export');
    }
    if (this.spec.abstract) {
      modifiers.push('abstract');
    }
    return modifiers;
  }

  private _initializer?: Initializer;

  public constructor(public scope: Scope, public readonly spec: ClassSpec) {
    super(scope, spec);
  }

  public get initializer() {
    return this._initializer;
  }

  public get extends() {
    return this.spec.extends;
  }

  public get implements() {
    return this.spec.implements ?? [];
  }

  public addInitializer(spec: InitializerSpec) {
    if (this._initializer) {
      throw new Error(`Class ${this.name} already has an initializer`);
    }
    this._initializer = new Initializer(this, spec);
    return this._initializer;
  }

  public newInstance(...args: Expression[]) {
    return new NewExpression(this.type, ...args);
  }
}
