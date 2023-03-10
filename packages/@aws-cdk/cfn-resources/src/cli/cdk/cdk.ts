import { expr, Expression, ExternalModule, Scope, Type } from '@cdklabs/typewriter';
import { ThingSymbol } from '@cdklabs/typewriter';

export class CdkCore extends ExternalModule {
  public readonly CfnResource = Type.fromName(this, 'CfnResource');
  public readonly IInspectable = Type.fromName(this, 'IInspectable');
  public readonly Token = Type.fromName(this, 'Token');
  public readonly ResolutionTypeHint = Type.fromName(this, 'ResolutionTypeHint');
  public readonly helpers = new CdkInternalHelpers(this);

  public readonly objectToCloudFormation = makeCallableExpr(this, 'objectToCloudFormation');
  public readonly stringToCloudFormation = makeCallableExpr(this, 'stringToCloudFormation');
  public readonly dateToCloudFormation = makeCallableExpr(this, 'dateToCloudFormation');
  public readonly booleanToCloudFormation = makeCallableExpr(this, 'booleanToCloudFormation');
  public readonly numberToCloudFormation = makeCallableExpr(this, 'numberToCloudFormation');
  public readonly canInspect = makeCallableExpr(this, 'canInspect');
  public readonly listMapper = makeCallableExpr(this, 'listMapper');
  public readonly hashMapper = makeCallableExpr(this, 'hashMapper');
  public readonly requireProperty = makeCallableExpr(this, 'requireProperty');

  constructor(fqn: string) {
    super(fqn);
  }

  public tokenAsString(arg: Expression) {
    return expr.type(this.Token).callMethod('asString', arg);
  }

  public tokenAsNumber(arg: Expression) {
    return expr.type(this.Token).callMethod('asNumber', arg);
  }

  public tokenAsList(arg: Expression) {
    return expr.type(this.Token).callMethod('asList', arg);
  }
}

export class CdkInternalHelpers extends ExternalModule {
  public readonly FromCloudFormationOptions = Type.fromName(this, 'FromCloudFormationOptions');

  constructor(parent: CdkCore) {
    super(`${parent.fqn}/lib/helpers-internal`);
  }
}

export class Constructs extends ExternalModule {
  public readonly Construct = Type.fromName(this, 'Construct');

  constructor() {
    super('constructs');
  }
}

export const CDK_CORE = new CdkCore('aws-cdk-lib');
export const CONSTRUCTS = new Constructs();

/**
 * This might need to be lifted, it'll do for now
 *
 * An Expression that you can call as `expr(args)`, instead of having
 * to write `expr.call(args)`.
 */
type CallableExprSym = Expression & {
  (...args: Expression[]): Expression;
};

function makeCallableExpr(scope: Scope, name: string): CallableExprSym {
  const exp = expr.sym(new ThingSymbol(name, scope));

  const fn = (...args: Expression[]): Expression => {
    return exp.call(...args);
  };

  Object.setPrototypeOf(fn, Object.getPrototypeOf(exp));
  return Object.assign(fn, exp);
}
