import { MemberType } from './member-type';
import { PropertySpec } from './property';
import { IScope } from './scope';
import { Type } from './type';
import { DeclarationKind, TypeSpec } from './type-declaration';

export interface InterfaceSpec extends TypeSpec {
  properties?: PropertySpec[];
  extends?: Type[];
}

export class InterfaceType extends MemberType {
  public readonly kind = DeclarationKind.Interface;

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
    spec.properties?.forEach((p) => this.addProperty(p));
  }

  public get extends() {
    return this.spec.extends ?? [];
  }
}
