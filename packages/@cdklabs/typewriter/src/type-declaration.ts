import { Documented } from './documented';
import { IScope } from './scope';
import { ThingSymbol } from './symbol';
import { Type } from './type';

/**
 * Kinds of declaration.
 */
export enum DeclarationKind {
  Class = 'class',
  Enum = 'enum',
  Struct = 'struct',
  Interface = 'interface',
  Function = 'function',
  MonkeyPatch = 'monkey-patch',
}

export interface Exportable {
  export?: boolean;
}

export interface Exported {
  exported?: boolean;
}

export interface TypeParameterSpec {
  readonly name: string;
  readonly extendsType?: Type;
}

export class TypeParameter implements TypeParameterSpec {
  public constructor(
    public readonly scope: TypeDeclaration,
    public readonly name: string,
    public readonly extendsType?: Type,
  ) {}

  public asType(): Type {
    return Type.ambient(this.name);
  }
}

export interface TypeSpec extends Documented, Exportable {
  /**
   * The simple name of the type (MyClass).
   *
   * @minLength 1
   */
  name: string;
  /**
   * The generic type parameters of the type.
   */
  typeParameters?: TypeParameterSpec[];
}

/**
 * An abstract jsii type
 */
export abstract class TypeDeclaration implements Documented, Exported {
  /**
   * The simple name of the type (MyClass).
   */
  public get name(): string {
    return this.spec.name;
  }

  /**
   * The fully qualified name of the type (``<parentScopeFqn>.<name>``)
   */
  public get fqn(): string {
    return this.scope.qualifyName(this.name);
  }

  public abstract kind: DeclarationKind;

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
    return !!this.spec.export;
  }

  /**
   * The generic type parameters of the type
   */
  public get typeParameters(): ReadonlyArray<TypeParameter> | undefined {
    return this.spec.typeParameters?.map((p) => new TypeParameter(this, p.name, p.extendsType));
  }

  public readonly type: Type;
  public readonly symbol: ThingSymbol;

  public constructor(public readonly scope: IScope, public readonly spec: TypeSpec) {
    this.symbol = new ThingSymbol(spec.name, scope);

    scope.registerType(this);
    this.type = Type.fromName(scope, this.name);
  }

  /**
   * Add a type parameter
   */
  public addTypeParameter(p: TypeParameterSpec): TypeParameter {
    this.spec.typeParameters ??= [];
    this.spec.typeParameters.push(p);

    return new TypeParameter(this, p.name, p.extendsType);
  }

  /**
   * Simple Human readable string representation of the type.
   */
  public toString(): string {
    return `${this.kind} ${this.fqn}`;
  }
}
