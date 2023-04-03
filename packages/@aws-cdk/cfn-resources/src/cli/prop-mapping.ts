import {
  expr,
  Expression,
  ObjectPropertyAccess,
  IsNotNullish,
  Type,
  PropertySpec,
  ThingSymbol,
  IScope,
  StructType,
} from '@cdklabs/typewriter';
import { PrimitiveType } from '@jsii/spec';
import { CDK_CORE } from './cdk/cdk';
import { cfnParserNameFromType, cfnProducerNameFromType, cfnPropsValidatorNameFromType } from './naming/conventions';

/**
 * Retain a list of properties with their CloudFormation and TypeScript names
 */
export class PropMapping {
  private readonly cfn2ts: Record<string, string> = {};
  private readonly cfn2Prop: Record<string, PropertySpec> = {};

  constructor(private readonly mapperFunctionsScope: IScope) {}

  public add(cfnName: string, property: PropertySpec) {
    this.cfn2ts[cfnName] = property.name;
    this.cfn2Prop[cfnName] = property;
  }

  public cfnFromTs(): Array<[string, string]> {
    return Object.entries(this.cfn2ts).sort(([a], [b]) => a.localeCompare(b));
  }

  public cfnProperties(): string[] {
    return Object.keys(this.cfn2Prop).sort();
  }

  public produceProperty(cfnName: string, struct: Expression): Expression {
    const value = new ObjectPropertyAccess(struct, this.cfn2ts[cfnName]);
    const type = this.cfn2Prop[cfnName].type;
    if (!type) {
      throw new Error(`No type for ${cfnName}`);
    }

    return this.typeHandlers(type).produce.call(value);
  }

  public parseProperty(cfnName: string, propsObj: Expression): Expression {
    const value = new ObjectPropertyAccess(propsObj, cfnName);
    const type = this.cfn2Prop[cfnName].type;
    if (!type) {
      throw new Error(`No type for ${cfnName}`);
    }

    return expr.cond(new IsNotNullish(value)).then(this.typeHandlers(type).parse.call(value)).else(expr.UNDEFINED);
  }

  public validateProperty(cfnName: string, propsObj: Expression, errorsObj: Expression): Expression[] {
    const prop = this.cfn2Prop[cfnName];

    const validations = new Array<Expression>();

    if (!prop.optional) {
      validations.push(
        errorsObj.callMethod(
          'collect',
          CDK_CORE.propertyValidator
            .call(expr.lit(prop.name), CDK_CORE.requiredValidator)
            .call(propsObj.prop(prop.name)),
        ),
      );
    }

    validations.push(
      errorsObj.callMethod(
        'collect',
        CDK_CORE.propertyValidator
          .call(expr.lit(prop.name), this.typeHandlers(prop.type).validate)
          .call(propsObj.prop(prop.name)),
      ),
    );

    return validations;
  }

  private typeHandlers(type: Type): TypeHandlers {
    if (type.equals(CDK_CORE.CfnTag)) {
      return {
        produce: CDK_CORE.cfnTagToCloudFormation,
        parse: CDK_CORE.helpers.FromCloudFormation.getCfnTag,
        validate: CDK_CORE.validateCfnTag,
      };
    }

    switch (type.primitive) {
      case PrimitiveType.String:
        return {
          produce: CDK_CORE.stringToCloudFormation,
          parse: CDK_CORE.helpers.FromCloudFormation.getString,
          validate: CDK_CORE.validateString,
        };
      case PrimitiveType.Date:
        return {
          produce: CDK_CORE.dateToCloudFormation,
          parse: CDK_CORE.helpers.FromCloudFormation.getDate,
          validate: CDK_CORE.validateDate,
        };
      case PrimitiveType.Number:
        return {
          produce: CDK_CORE.numberToCloudFormation,
          parse: CDK_CORE.helpers.FromCloudFormation.getNumber,
          validate: CDK_CORE.validateNumber,
        };
      case PrimitiveType.Json:
        return {
          produce: CDK_CORE.objectToCloudFormation,
          parse: CDK_CORE.helpers.FromCloudFormation.getAny,
          validate: CDK_CORE.validateObject,
        };
      case PrimitiveType.Any:
        return {
          produce: CDK_CORE.objectToCloudFormation,
          parse: CDK_CORE.helpers.FromCloudFormation.getAny,
          validate: CDK_CORE.validateObject,
        };
      case PrimitiveType.Boolean:
        return {
          produce: CDK_CORE.booleanToCloudFormation,
          parse: CDK_CORE.helpers.FromCloudFormation.getBoolean,
          validate: CDK_CORE.validateBoolean,
        };
    }

    if (type.arrayOfType) {
      const innerHandler = this.typeHandlers(type.arrayOfType);
      return {
        produce: CDK_CORE.listMapper(innerHandler.produce),
        parse: CDK_CORE.helpers.FromCloudFormation.getArray(innerHandler.parse),
        validate: CDK_CORE.listValidator.call(innerHandler.validate),
      };
    }

    if (type.mapOfType) {
      const innerHandler = this.typeHandlers(type.mapOfType);
      return {
        produce: CDK_CORE.hashMapper(innerHandler.produce),
        parse: CDK_CORE.helpers.FromCloudFormation.getMap(innerHandler.parse),
        validate: CDK_CORE.hashValidator.call(innerHandler.validate),
      };
    }

    if (type.symbol) {
      const struct = StructType.assertStruct(type.symbol.findDeclaration());
      return {
        produce: expr.sym(new ThingSymbol(cfnProducerNameFromType(struct), this.mapperFunctionsScope)),
        parse: expr.sym(new ThingSymbol(cfnParserNameFromType(struct), this.mapperFunctionsScope)),
        validate: expr.sym(new ThingSymbol(cfnPropsValidatorNameFromType(struct), this.mapperFunctionsScope)),
      };
    }

    if (type.unionOfTypes) {
      const innerProducers = type.unionOfTypes.map((t) => this.typeHandlers(t));
      const validators = innerProducers.map((p) => p.validate);

      return {
        produce: CDK_CORE.unionMapper(expr.list(validators), expr.list(innerProducers.map((p) => p.produce))),
        parse: CDK_CORE.helpers.FromCloudFormation.getTypeUnion(
          expr.list(validators),
          expr.list(innerProducers.map((p) => p.parse)),
        ),
        validate: CDK_CORE.unionValidator.call(...validators),
      };
    }

    const oops = expr.ident(`/* @todo typeHandlers(${type}) */`);
    return {
      produce: oops,
      parse: oops,
      validate: oops,
    };
  }
}

interface TypeHandlers {
  readonly produce: Expression;
  readonly parse: Expression;
  readonly validate: Expression;
}
