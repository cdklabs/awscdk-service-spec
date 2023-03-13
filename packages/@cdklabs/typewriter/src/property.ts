import * as jsii from '@jsii/spec';
import { DocsSpec } from './documented';
import { Expression } from './expression';
import { ObjectPropertyAccess } from './expressions';
import { MemberType } from './member-type';
import { Type } from './type';
import { MemberKind, MemberVisibility, TypeMember } from './type-member';

export interface PropertySpec extends Omit<jsii.Property, 'assembly' | 'fqn' | 'docs' | 'type' | 'kind'> {
  docs?: DocsSpec;
  type: Type;
  initializer?: Expression;
}

export class Property extends TypeMember {
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
}
