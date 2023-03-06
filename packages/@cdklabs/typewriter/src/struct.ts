import * as jsii from '@jsii/spec';
import { Property, PropertySpec } from './property';
import { Scope } from './scope';
import { TypeDeclaration, TypeKind } from './type-declaration';
import { MemberKind } from './type-member';

export interface StructSpec extends Omit<jsii.InterfaceType, 'assembly' | 'fqn' | 'kind'> {
  kind: TypeKind.Interface;
  export?: boolean;
  properties?: PropertySpec[];
}

export class StructType extends TypeDeclaration {
  /**
   * Lists all direct properties of the interface
   */
  public get properties(): Map<string, Property> {
    const result = new Map<string, Property>();

    for (const p of this.spec.properties ?? []) {
      result.set(p.name, new Property(this, p));
    }

    return result;
  }

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

  public constructor(public scope: Scope, public readonly spec: StructSpec) {
    super(scope, spec);
  }

  /**
   * Adds a property to the interface
   */
  public addProperty(spec: Omit<PropertySpec, 'immutable' | 'kind'>) {
    if (!this.spec.properties) {
      this.spec.properties = [];
    }
    this.spec.properties.push({
      ...spec,
      immutable: true,
      kind: MemberKind.Property,
    });
  }
}
