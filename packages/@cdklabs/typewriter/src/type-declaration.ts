import * as jsii from '@jsii/spec';
import { Documented } from './documented';
import { Scope } from './scope';
import { Type } from './type';

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
export abstract class TypeDeclaration implements Documented {
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

  /**
   * Documentation for this type
   */
  public get docs() {
    return this.spec.docs;
  }

  public readonly type: Type;

  public constructor(public readonly scope: Scope, public readonly spec: TypeSpec) {
    scope.addType(this);
    this.type = new Type(scope, {
      fqn: this.fqn,
    });
  }

  /**
   * Simple Human readable string representation of the type.
   */
  public toString(): string {
    return `${this.kind} ${this.fqn}`;
  }
}
