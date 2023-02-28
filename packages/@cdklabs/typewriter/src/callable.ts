import { Block } from './block';
import { CallableStatement, InvokeCallable, InvokeExpression } from './expressions/invoke';
import { Parameter, ParameterSpec } from './parameter';
import { Scope } from './scope';
import { Statement } from './statements';
import { Type, TypeKind, TypeSpec } from './type';
import { TypeReference, TypeReferenceSpec } from './type-ref';

interface CallableSpec extends TypeSpec {
  kind: TypeKind.Function;
  name: string;
  parameters?: ParameterSpec[];
  returnType?: TypeReferenceSpec;
  body?: Block;
}

export class Callable extends Type implements CallableStatement {
  public readonly body: Block;

  public constructor(public readonly scope: Scope, public readonly spec: CallableSpec) {
    super(scope, spec);
    this.body = spec.body ?? new Block();
  }

  invoke(...args: Statement[]): InvokeExpression {
    return new InvokeCallable(this, args);
  }

  public get name(): string {
    return this.spec.name;
  }

  public get returnType(): TypeReference {
    return new TypeReference(this.scope, this.spec.returnType);
  }

  public get parameters(): Parameter[] {
    return (this.spec.parameters ?? []).map((p) => new Parameter(this, p));
  }
}
