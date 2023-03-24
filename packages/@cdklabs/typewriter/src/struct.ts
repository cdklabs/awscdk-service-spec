import * as jsii from '@jsii/spec';
import { MemberType } from './member-type';
import { Property, PropertySpec } from './property';
import { IScope } from './scope';
import { DeclarationKind, TypeDeclaration } from './type-declaration';

export interface StructSpec extends Omit<jsii.InterfaceType, 'assembly' | 'fqn' | 'kind' | 'properties'> {
  export?: boolean;
  properties?: PropertySpec[];
}

export class StructType extends MemberType {
  /**
   * Assert that something is a struct, failing otherwise
   */
  public static assertStruct(x: TypeDeclaration): StructType {
    if (!(x instanceof StructType)) {
      throw new Error(`Expect ${x} to refer to a struct`);
    }
    return x;
  }

  public readonly kind = DeclarationKind.Struct;

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

  public constructor(public scope: IScope, public readonly spec: StructSpec) {
    super(scope, spec);
  }

  /**
   * Adds a property to the interface
   */
  public addProperty(spec: Omit<PropertySpec, 'immutable'>): Property {
    return super.addProperty({
      ...spec,
      immutable: true,
    });
  }
}
