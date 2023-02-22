import * as jsii from '@jsii/spec';
import { Scope } from './scope';

export interface TypeSpec extends Omit<jsii.TypeBase, 'assembly' | 'fqn'> {}

/**
 * An abstract jsii type
 */
export abstract class Type {
  /**
   * The simple name of the type (MyClass).
   */
  public get name(): string {
    return this.spec.name;
  }

  /**
   * The fully qualified name of the type (``<assembly>.<namespace>.<name>``)
   */
  public get fqn(): string {
    return `${this.scope.fqn}.${this.name}`;
  }

  /**
   * The kind of the type.
   */
  public get kind(): jsii.TypeKind {
    return this.spec.kind;
  }

  public constructor(public readonly scope: Scope, public readonly spec: TypeSpec) {
    scope.addType(this);
  }

  /**
   * Simple Human readable string representation of the type.
   */
  public toString(): string {
    return `${this.kind} ${this.fqn}`;
  }
}
