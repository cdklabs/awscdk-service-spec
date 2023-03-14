import { $E, $T, expr, Expression, ExternalModule, Scope, ThingSymbol, Type } from '@cdklabs/typewriter';

export class CdkCore extends ExternalModule {
  public readonly CfnResource = Type.fromName(this, 'CfnResource');
  public readonly IInspectable = Type.fromName(this, 'IInspectable');
  public readonly TreeInspector = Type.fromName(this, 'TreeInspector');
  public readonly Token = $T(Type.fromName(this, 'Token'));
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
    return this.Token.asString(arg);
  }

  public tokenAsNumber(arg: Expression) {
    return this.Token.asNumber(arg);
  }

  public tokenAsList(arg: Expression) {
    return this.Token.asList(arg);
  }
}

export class CdkInternalHelpers extends ExternalModule {
  public readonly FromCloudFormationOptions = Type.fromName(this, 'FromCloudFormationOptions');
  public readonly FromCloudFormationResult = $T(Type.fromName(this, 'FromCloudFormationResult'));
  public readonly FromCloudFormation = $T(Type.fromName(this, 'FromCloudFormation'));
  public readonly FromCloudFormationPropertyObject = Type.fromName(this, 'FromCloudFormationPropertyObject');

  constructor(parent: CdkCore) {
    super(`${parent.fqn}/core/lib/helpers-internal`);
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

function makeCallableExpr(scope: Scope, name: string) {
  return $E(expr.sym(new ThingSymbol(name, scope)));
}
