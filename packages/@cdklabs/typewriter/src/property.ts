import * as jsii from '@jsii/spec';
import { DocsSpec } from './documented';
import { StructType } from './struct';
import { MemberKind, MemberVisibility, TypeMember } from './type-member';
import { Type } from './type';

export interface PropertySpec extends Omit<jsii.Property, 'assembly' | 'fqn' | 'docs' | 'type'> {
  kind: MemberKind.Property;
  docs?: DocsSpec;
  type: Type;
}

export class Property extends TypeMember {
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

  /**
   * The type of the property as a reference.
   */
  public readonly type: Type;

  public constructor(public readonly scope: StructType, public readonly spec: PropertySpec) {
    super(scope, spec);
    this.type = spec.type;
  }
}
