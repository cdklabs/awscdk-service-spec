import { Block } from './block';
import { CallableStatement, InvokeCallable, InvokeExpression } from './expressions/invoke';
import { Parameter, ParameterSpec } from './parameter';
import { Scope } from './scope';
import { Statement } from './statements';
import { TypeDeclaration, TypeKind, TypeSpec } from './type-declaration';
import { Type } from './type';

interface CallableSpec extends TypeSpec {
  kind: TypeKind.Function;
  name: string;
  parameters?: ParameterSpec[];
  returnType?: Type;
  body?: Block;
}

export class Callable extends TypeDeclaration implements CallableStatement {
  public readonly body: Block;
  public readonly returnType: Type;

  public constructor(public readonly scope: Scope, public readonly spec: CallableSpec) {
    super(scope, spec);
    this.body = spec.body ?? new Block();
    this.returnType = spec.returnType ?? Type.void(scope);
  }

  invoke(...args: Statement[]): InvokeExpression {
    return new InvokeCallable(this, args);
  }

  public get name(): string {
    return this.spec.name;
  }

  public get parameters(): Parameter[] {
    return (this.spec.parameters ?? []).map((p) => new Parameter(this, p));
  }
}
