import { Documented } from './documented';
import { Expression, Identifier } from './expressions';
import { Parameter, ParameterSpec } from './parameter';
import { IScope } from './scope';
import { Statement } from './statements';
import { Block } from './statements/block';
import { asStmt } from './statements/private';
import { Type } from './type';
import { DeclarationKind, TypeDeclaration, TypeSpec } from './type-declaration';

export interface CallableSpec extends TypeSpec {
  name: string;
  parameters?: ParameterSpec[];
  returnType?: Type;
  body?: Block;
}

export interface CallableDeclaration extends Documented {
  readonly body?: Block;
  readonly returnType: Type;
  readonly name: string;
  readonly parameters: Parameter[];
}

export interface CallableExpr {
  invoke(...args: Expression[]): Expression;
}

/**
 * Can't be called "Function"
 */
export class FreeFunction extends TypeDeclaration implements CallableDeclaration {
  public readonly returnType: Type;
  public readonly kind = DeclarationKind.Function;
  public readonly parameters = new Array<Parameter>();

  private _body?: Block;

  constructor(public readonly scope: IScope, public readonly spec: CallableSpec) {
    super(scope, spec);
    this._body = spec.body;
    this.returnType = spec.returnType ?? Type.VOID;
    for (const p of this.spec.parameters ?? []) {
      this.addParameter(p);
    }
  }

  public get name(): string {
    return this.spec.name;
  }

  public get fn(): Expression {
    return new Identifier(this.name);
  }

  public get body(): Block | undefined {
    return this._body;
  }

  public addBody(...stmts: Array<Statement | Expression>) {
    if (!this._body) {
      this._body = new Block();
    }
    this._body.add(...stmts.map(asStmt));
  }

  public addParameter(spec: ParameterSpec) {
    const p = new Parameter(this, spec);
    this.parameters.push(p);
    return p;
  }
}

export function isCallableDeclaration(x: unknown): x is CallableDeclaration {
  return x && typeof x === 'object' && (x as any).parameters;
}
