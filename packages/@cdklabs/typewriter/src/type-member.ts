import { DocsSpec, Documented } from './documented';
import { StructType } from './struct';
import { Property as PropertyType } from './property';

export interface TypeMemberSpec {
  name: string;
  kind: MemberKind;
  docs?: DocsSpec;
}

export enum MemberKind {
  Initializer = 'initializer',
  Method = 'method',
  Property = 'property',
}

export enum MemberVisibility {
  Public = 'public',
  Protected = 'protected',
  Private = 'Private',
}

export abstract class TypeMember implements Documented {
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

  /**
   * Documentation for this type member
   */
  public get docs() {
    return this.spec.docs;
  }

  public abstract visibility: MemberVisibility;

  public constructor(public readonly scope: StructType, public readonly spec: TypeMemberSpec) {}

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
