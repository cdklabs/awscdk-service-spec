import * as jsii from '@jsii/spec';
import { Scope } from './scope';

/**
 * Kinds of types.
 */
export enum TypeKind {
  Class = 'class',
  Enum = 'enum',
  Interface = 'interface',
  Function = 'function',
}

export interface TypeSpec extends Omit<jsii.TypeBase, 'assembly' | 'fqn' | 'kind'> {
  kind: TypeKind;
}

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
  public get kind(): TypeKind {
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
