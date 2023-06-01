import { CallableDeclaration, CallableSpec } from './callable';
import { DocsSpec, Documented } from './documented';
import { Expression, ObjectPropertyAccess } from './expressions';
import { MemberType } from './member-type';
import { Parameter, ParameterSpec } from './parameter';
import { Property as PropertyType } from './property';
import { Block, Statement } from './statements';
import { asStmt } from './statements/private';
import { Type } from './type';

export interface TypeMemberSpec {
  name: string;
  docs?: DocsSpec;
  abstract?: boolean;
  static?: boolean;
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
  public abstract readonly kind: MemberKind;

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

  public get abstract() {
    return this.spec.abstract ?? false;
  }

  public get static() {
    return this.spec.static ?? false;
  }

  public abstract visibility: MemberVisibility;

  public constructor(public readonly scope: MemberType, public readonly spec: TypeMemberSpec) {}

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

export interface MethodSpec extends CallableSpec {
  visibility?: MemberVisibility;
  static?: boolean;
}

export class Method extends TypeMember implements CallableDeclaration {
  public readonly returnType: Type;
  public readonly visibility: MemberVisibility;
  public readonly parameters = new Array<Parameter>();
  private _body?: Block;

  constructor(public readonly type: MemberType, public readonly methodSpec: MethodSpec) {
    super(type, methodSpec);
    this._body = methodSpec.body;
    this.returnType = methodSpec.returnType ?? Type.VOID;
    this.visibility = methodSpec.visibility ?? MemberVisibility.Public;
    for (const p of methodSpec.parameters ?? []) {
      this.parameters.push(new Parameter(this, p));
    }
  }

  public get body(): Block | undefined {
    return this._body;
  }

  public get kind(): MemberKind {
    return MemberKind.Method;
  }

  public get name(): string {
    return this.spec.name;
  }

  public bind(receiver: Expression) {
    return new ObjectPropertyAccess(receiver, this.name);
  }

  public addParameter(spec: ParameterSpec) {
    const p = new Parameter(this, spec);
    this.parameters.push(p);
    return p;
  }

  public addBody(...stmts: Array<Statement | Expression>) {
    if (!this._body) {
      this._body = new Block();
    }
    this._body.add(...stmts.map(asStmt));
  }
}

export interface InitializerSpec extends Omit<MethodSpec, 'name' | 'returnType'> {}

export class Initializer extends Method implements CallableDeclaration {
  constructor(public readonly type: MemberType, public readonly initializerSpec: InitializerSpec) {
    super(type, {
      name: 'constructor',
      returnType: type.type,
    });
  }

  public get kind(): MemberKind {
    return MemberKind.Initializer;
  }
}

export function isCallable(x: unknown) {
  return x && typeof x === 'object' && !!(x as any).asSymbol;
}
