import { PrimitiveType } from '@jsii/spec';
import { Module } from '../module';
import { TypeScriptRenderer } from '../renderer';
import { Scope } from '../scope';
import { TypeReference, TypeReferenceSpec } from '../type-ref';

export interface Statement {}

export class Symbol implements Statement {
  public constructor(public readonly name: string) {}

  public asObject(): ObjectLiteral {
    return new (class extends ObjectLiteral {
      access(property: string): ObjectAccessStatement {
        return new ObjectAccessStatement(this, property);
      }
    })();
  }
}

export class ReturnStatement implements Statement {
  public constructor(public readonly statement?: Statement) {}
}

function ret(statement?: Statement): Statement {
  return new ReturnStatement(statement);
}

export interface ObjectAccessible {
  access(property: string): ObjectAccessStatement;
}

export class ObjectAccessStatement implements Statement {
  public constructor(public readonly object: ObjectLiteral | Symbol, public readonly property: string) {}
}

export class ObjectLiteral implements Statement, ObjectAccessible {
  public constructor(public readonly contents: Record<string, Statement> = {}) {}

  public get keys(): string[] {
    return Object.keys(this.contents);
  }

  public get entries(): Array<[string, Statement]> {
    return Object.entries(this.contents);
  }

  public access(property: string): ObjectAccessStatement {
    return new ObjectAccessStatement(this, property);
  }
}

class Any implements Statement {
  public constructor() {}
}

function object(data: Record<string, Statement> = {}): Statement {
  return new ObjectLiteral(data);
}

interface CallableStatement<R extends Statement = Any> {
  invoke(...args: Statement[]): R;
}

class InvokeCallable implements Statement {
  public constructor(public readonly callable: CallableStatement, public readonly args: Statement[] = []) {}
}

interface ParameterSpec {
  name: string;
  type: TypeReferenceSpec;
}

interface CallableSpec {
  name: string;
  parameters?: ParameterSpec[];
  returnType?: TypeReferenceSpec;
  body?: Statement[];
}

class Parameter {
  public constructor(public readonly scope: Callable, public readonly spec: ParameterSpec) {}

  public get name(): string {
    return this.spec.name;
  }

  public get type(): TypeReference {
    return new TypeReference(this.scope.scope, this.spec.type);
  }
}

export class Callable implements CallableStatement {
  public constructor(public readonly scope: Scope, public readonly spec: CallableSpec) {}

  invoke(...args: Statement[]): Any {
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

class ExternalModule extends Module {
  public function(name: string): Callable {
    return new Callable(this, {
      name,
      parameters: [],
    });
  }
}

class CdkCore extends ExternalModule {
  public objectToCloudFormation() {
    return this.function('objectToCloudFormation');
  }
}

const validator = new Callable(new Module('test'), {
  name: 'cfnSkillPropsToCloudFormation',
  returnType: {
    primitive: PrimitiveType.Any,
  },
  parameters: [
    {
      name: 'properties',
      type: {
        primitive: PrimitiveType.Any,
      },
    },
  ],
});

function sym(name: string): Symbol {
  return new Symbol(name);
}

const cdk = new CdkCore('@aws-cdk/core');

validator.body = [
  // if(not(call(fromImport('cdk.canInspect'), Symbol.for('properties')))).then(returnExpression(Symbol.for('properties'))),
  // chain(call(afnc, Symbol.for('properties')), call(Symbol.for('assertSuccess')),
  // returnExpression(ObjectLiteral({[Symbol.for('Manifest')]: call(fromImport('cdk.objectToCloudFormation'), chain(Symbol.for('properties'), Symbol.for('manifest'));}))
  ret(
    object({
      Manifest: cdk.objectToCloudFormation().invoke(sym('property').asObject().access('manifest')),
    }),
  ),
];

const r = new TypeScriptRenderer();

console.log(r.renderFunction(validator, 0));
