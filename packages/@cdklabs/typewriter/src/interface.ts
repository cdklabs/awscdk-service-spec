import { MemberType } from './member-type';
import { PropertySpec } from './property';
import { IScope } from './scope';
import { SymbolKind } from './symbol';
import { Type } from './type';
import { TypeSpec } from './type-declaration';

export interface InterfaceSpec extends TypeSpec {
  properties?: PropertySpec[];
  extends?: Type[];
}

export class InterfaceType extends MemberType {
  public readonly kind = SymbolKind.Interface;

  /**
   * List the modifiers of the interface
   */
  public get modifiers(): Array<string> {
    const modifiers = [];

    if (this.spec.export) {
      modifiers.push('export');
    }
    return modifiers;
  }

  public constructor(public scope: IScope, public readonly spec: InterfaceSpec) {
    super(scope, spec);
  }

  public get extends() {
    return this.spec.extends ?? [];
  }
}
