import * as jsii from '@jsii/spec';
import { DocsSpec, Documented } from './documented';
import { Expression } from './expression';
import { ObjectPropertyAccess } from './expressions';
import { MemberType } from './member-type';
import { Block } from './statements/block';
import { Type } from './type';
import { MemberKind, MemberVisibility, TypeMember } from './type-member';

export interface PropertySpec extends Omit<jsii.Property, 'assembly' | 'fqn' | 'docs' | 'type' | 'kind'> {
  docs?: DocsSpec;
  type: Type;
  initializer?: Expression;
  getterBody?: Block;
  setterBody?: (value: Expression) => Block;
}

export interface IProperty extends Documented {
  readonly name: string;
  readonly abstract: boolean;
  readonly immutable: boolean;
  readonly optional: boolean;
  readonly type: Type;
  readonly initializer?: Expression;
  readonly visibility: MemberVisibility;
  readonly static: boolean;
}

export class Property extends TypeMember implements IProperty {
  public readonly kind = MemberKind.Property;

  /**
   * Indicates if this property only has a getter (immutable).
   */
  public get immutable(): boolean {
    return !!this.spec.immutable;
  }

  /**
   * Is the property optional.
   */
  public get optional(): boolean {
    return !!this.spec?.optional;
  }

  /**
   * The visibility of the member.
   */
  public get visibility(): MemberVisibility {
    if (this.spec?.protected) {
      return MemberVisibility.Protected;
    }
    return MemberVisibility.Public;
  }

  public get initializer() {
    return this.spec.initializer;
  }

  /**
   * The type of the property as a reference.
   */
  public readonly type: Type;

  public constructor(public readonly scope: MemberType, public readonly spec: PropertySpec) {
    super(scope, {
      ...spec,
    });
    this.type = spec.type;
  }

  /**
   * Read a property from an object
   */
  public from(x: Expression): Expression {
    return new ObjectPropertyAccess(x, this.name);
  }

  public get getter() {
    return this.spec.getterBody;
  }

  public get setter() {
    return this.spec.setterBody;
  }

  public get isGetterSetter() {
    return this.getter || this.setter;
  }
}
