import * as jsii from '@jsii/spec';
import { Documented } from './documented';
import { Scope } from './scope';
import { ThingSymbol, SymbolKind } from './symbol';
import { Type } from './type';

export interface TypeSpec extends Omit<jsii.TypeBase, 'assembly' | 'fqn' | 'kind'> {
  exported?: boolean;
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

  public abstract kind: SymbolKind;

  /**
   * Documentation for this type
   */
  public get docs() {
    return this.spec.docs;
  }

  /**
   * Whether this type is being exported from its scope
   */
  public get exported() {
    return !!this.spec.exported;
  }

  public readonly type: Type;
  public readonly symbol: ThingSymbol;

  public constructor(public readonly scope: Scope, public readonly spec: TypeSpec) {
    this.symbol = new ThingSymbol(spec.name, scope);

    scope.addType(this);
    this.type = Type.fromName(scope, this.name);
  }

  /**
   * Simple Human readable string representation of the type.
   */
  public toString(): string {
    return `${this.kind} ${this.fqn}`;
  }
}
