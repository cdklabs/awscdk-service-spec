import { Parameter, ParameterSpec } from './parameter';
import { Scope } from './scope';
import { CallableStatement, InvokeCallable, InvokeStatement, Statement } from './statements';
import { Type, TypeKind, TypeSpec } from './type';
import { TypeReference, TypeReferenceSpec } from './type-ref';

interface CallableSpec extends TypeSpec {
  kind: TypeKind.Function;
  name: string;
  parameters?: ParameterSpec[];
  returnType?: TypeReferenceSpec;
  body?: Statement[];
}

export class Callable extends Type implements CallableStatement {
  public constructor(public readonly scope: Scope, public readonly spec: CallableSpec) {
    super(scope, spec);
  }

  invoke(...args: Statement[]): InvokeStatement {
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

  public get body(): Statement[] {
    return this.spec.body ?? [];
  }

  public set body(statements: Statement[]) {
    this.spec.body = statements;
  }
}
