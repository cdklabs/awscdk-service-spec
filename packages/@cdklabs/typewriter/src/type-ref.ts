import * as jsii from '@jsii/spec';
import { Scope } from './scope';
import { Type } from './type';

export type TypeReferenceSpec = jsii.TypeReference

/**
 * A reference to an existing type in the given scope
 */
export class TypeReference {
  public get fqn(): string | undefined {
    return jsii.isNamedTypeReference(this.spec) ? this.spec.fqn : undefined;
  }

  public constructor(
    public readonly scope: Scope,
    public readonly spec: TypeReferenceSpec,
  ) {
  }

  public toString(): string {
    if (this.void) {
      return 'void';
    }
    if (this.primitive) {
      return this.primitive;
    }
    if (this.fqn) {
      return this.fqn;
    }

    if (this.arrayOfType) {
      return `Array<${this.arrayOfType.toString()}>`;
    }
    if (this.mapOfType) {
      return `Map<string, ${this.mapOfType.toString()}>`;
    }
    if (this.unionOfTypes) {
      return this.unionOfTypes.map((x) => x.toString()).join(' | ');
    }

    throw new Error(`Unknown type reference: ${JSON.stringify(this.spec)}`);
  }

  public get void(): boolean {
    return !this.spec;
  }

  public get isAny(): boolean {
    return this.primitive === 'any';
  }

  public get primitive(): string | undefined {
    if (!jsii.isPrimitiveTypeReference(this.spec)) {
      return undefined;
    }

    return this.spec.primitive;
  }

  public get type(): Type | undefined {
    if (!jsii.isNamedTypeReference(this.spec)) {
      return undefined;
    }

    return this.scope.findType(this.spec.fqn);
  }

  public get arrayOfType(): TypeReference | undefined {
    if (!jsii.isCollectionTypeReference(this.spec)) {
      return undefined;
    }

    if (this.spec.collection.kind !== jsii.CollectionKind.Array) {
      return undefined;
    }

    return new TypeReference(this.scope, this.spec.collection.elementtype);
  }

  public get mapOfType(): TypeReference | undefined {
    if (!jsii.isCollectionTypeReference(this.spec)) {
      return undefined;
    }

    if (this.spec.collection.kind !== jsii.CollectionKind.Map) {
      return undefined;
    }

    return new TypeReference(this.scope, this.spec.collection.elementtype);
  }

  public get unionOfTypes(): TypeReference[] | undefined {
    if (!jsii.isUnionTypeReference(this.spec)) {
      return undefined;
    }

    return this.spec.union.types.map((t) => new TypeReference(this.scope, t));
  }
}