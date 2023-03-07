import { Block } from './statements/block';
import { InvokeCallable } from './expressions/invoke';
import { Parameter, ParameterSpec } from './parameter';
import { Scope } from './scope';
import { Statement as Expression } from './statements';
import { TypeDeclaration, TypeSpec } from './type-declaration';
import { Type } from './type';
import { SymbolKind } from './symbol';

interface CallableSpec extends TypeSpec {
  name: string;
  parameters?: ParameterSpec[];
  returnType?: Type;
  body?: Block;
}

export class Callable extends TypeDeclaration {
  public readonly body: Block;
  public readonly returnType: Type;
  public readonly kind = SymbolKind.Function;

  public constructor(public readonly scope: Scope, public readonly spec: CallableSpec) {
    super(scope, spec);
    this.body = spec.body ?? new Block();
    this.returnType = spec.returnType ?? Type.VOID;
  }

  invoke(...args: Expression[]): Expression {
    // FIXME: Invoke from another module cannot work given the modeling we currently have
    return new InvokeCallable(this.asSymbol(), args);
  }

  public get name(): string {
    return this.spec.name;
  }

  public get parameters(): Parameter[] {
    return (this.spec.parameters ?? []).map((p) => new Parameter(this, p));
  }
}
