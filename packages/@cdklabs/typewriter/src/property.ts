import * as jsii from '@jsii/spec';
import { InterfaceType } from './interface';
import { MemberKind, MemberVisibility, TypeMember } from './type-member';
import { TypeReference } from './type-ref';

export interface PropertySpec extends Omit<jsii.Property, 'assembly' | 'fqn'> {
  kind: MemberKind.Property;
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
  public get type(): TypeReference {
    return new TypeReference(this.scope.scope, this.spec.type);
  }

  public constructor(public readonly scope: InterfaceType, public readonly spec: PropertySpec) {
    super(scope, spec);
  }
}
