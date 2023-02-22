import { InterfaceType } from './interface';
import { Property as PropertyType } from './property';

export interface TypeMemberSpec {
  name: string;
  kind: MemberKind;
}

export enum MemberKind {
  Initializer = 'initializer',
  Method = 'method',
  Property = 'property',
}

export abstract class TypeMember {
  /**
   * The simple name of the type (MyClass).
   */
  public get name(): string {
    return this.spec.name;
  }

  /**
   * The kind of the type.
   */
  public get kind(): MemberKind {
    return this.spec.kind;
  }

  /**
   * The fully qualified name of the member (``<assembly>.<namespace>.<name>#member``)
   */
  public get fqn(): string {
    return `${this.scope.fqn}#${this.name}`;
  }

  public constructor(public readonly scope: InterfaceType, public readonly spec: TypeMemberSpec) {}

  /**
   * Simple Human readable string representation of the property.
   */
  public toString(): string {
    return `${this.kind} ${this.fqn}`;
  }

  /**
   * Determines whether this is a property type or not.
   */
  public isProperty(): this is PropertyType {
    return this.kind === MemberKind.Property;
  }
}
