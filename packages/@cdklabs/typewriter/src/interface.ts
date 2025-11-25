import { MemberType } from './member-type';
import { Property, PropertySpec } from './property';
import { IScope } from './scope';
import { Type } from './type';
import { DeclarationKind, TypeSpec } from './type-declaration';
import { MethodSpec } from './type-member';

export interface InterfaceSpec extends TypeSpec {
  properties?: PropertySpec[];
  methods?: MethodSpec[];
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
    spec.methods?.forEach((p) => this.addMethod(p));
  }

  public get extends() {
    return this.spec.extends ?? [];
  }

  /**
   * Update some of the fields of the interface spec, except fields that are immutable or managed elsewhere.
   *
   * Members are managed via specific method calls.
   */
  public update<A extends Omit<Partial<InterfaceSpec>, 'properties' | 'methods' | 'name'>>(updates: A) {
    Object.assign(this.spec, updates);
  }

  /**
   * Adds a property to the interface
   *
   * Interface properties must be public.
   */
  public addProperty(spec: Omit<PropertySpec, 'protected' | 'visibility'>): Property {
    return super.addProperty(spec);
  }
}
