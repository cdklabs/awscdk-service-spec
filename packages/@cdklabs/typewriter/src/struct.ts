import { InterfaceSpec } from './interface';
import { MemberType } from './member-type';
import { Property, PropertySpec } from './property';
import { IScope } from './scope';
import { DeclarationKind, TypeDeclaration } from './type-declaration';

export interface StructSpec extends InterfaceSpec {}

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
    spec.properties?.forEach((p) => this.addProperty(p));
  }

  public get extends() {
    return this.spec.extends ?? [];
  }

  /**
   * Adds a property to the interface
   *
   * Struct members are always public and immutable.
   */
  public addProperty(spec: Omit<PropertySpec, 'immutable' | 'protected' | 'visibility'>): Property {
    return super.addProperty({
      ...spec,
      immutable: true,
    });
  }
}
