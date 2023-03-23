import {
  expr,
  Expression,
  ObjectPropertyAccess,
  IsNotNullish,
  Type,
  UNDEFINED,
  PropertySpec,
  ThingSymbol,
  IScope,
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

    return this.typeProducer(type).produce.call(value);
  }

  public parseProperty(cfnName: string, propsObj: Expression): Expression {
    const value = new ObjectPropertyAccess(propsObj, cfnName);
    const type = this.cfn2Prop[cfnName].type;
    if (!type) {
      throw new Error(`No type for ${cfnName}`);
    }

    return expr.cond(new IsNotNullish(value)).then(this.typeProducer(type).parse.call(value)).else(UNDEFINED);
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
          .call(expr.lit(prop.name), this.typeValidator(prop.type))
          .call(propsObj.prop(prop.name)),
      ),
    );

    return validations;
  }

  private typeProducer(type: Type): Mapper {
    if (type.equals(CDK_CORE.CfnTag)) {
      return {
        produce: CDK_CORE.cfnTagToCloudFormation,
        parse: CDK_CORE.helpers.FromCloudFormation.getCfnTag,
      };
    }

    switch (type.primitive) {
      case PrimitiveType.String:
        return {
          produce: CDK_CORE.stringToCloudFormation,
          parse: CDK_CORE.helpers.FromCloudFormation.getString,
        };
      case PrimitiveType.Date:
        return {
          produce: CDK_CORE.dateToCloudFormation,
          parse: CDK_CORE.helpers.FromCloudFormation.getDate,
        };
      case PrimitiveType.Number:
        return {
          produce: CDK_CORE.numberToCloudFormation,
          parse: CDK_CORE.helpers.FromCloudFormation.getNumber,
        };
      case PrimitiveType.Json:
        return {
          produce: CDK_CORE.objectToCloudFormation,
          parse: CDK_CORE.helpers.FromCloudFormation.getAny,
        };
      case PrimitiveType.Any:
        return {
          produce: CDK_CORE.objectToCloudFormation,
          parse: CDK_CORE.helpers.FromCloudFormation.getAny,
        };
      case PrimitiveType.Boolean:
        return {
          produce: CDK_CORE.booleanToCloudFormation,
          parse: CDK_CORE.helpers.FromCloudFormation.getBoolean,
        };
    }

    if (type.arrayOfType) {
      return {
        produce: CDK_CORE.listMapper(this.typeProducer(type.arrayOfType).produce),
        parse: CDK_CORE.helpers.FromCloudFormation.getArray(this.typeProducer(type.arrayOfType).parse),
      };
    }

    if (type.mapOfType) {
      return {
        produce: CDK_CORE.hashMapper(this.typeProducer(type.mapOfType).produce),
        parse: CDK_CORE.helpers.FromCloudFormation.getMap(this.typeProducer(type.mapOfType).parse),
      };
    }

    if (type.symbol) {
      return {
        produce: expr.sym(new ThingSymbol(cfnProducerNameFromType(type.symbol.name), this.mapperFunctionsScope)),
        parse: expr.sym(new ThingSymbol(cfnParserNameFromType(type.symbol.name), this.mapperFunctionsScope)),
      };
    }

    return {
      produce: expr.ident(`/* @todo typeMapper(${type}) */`),
      parse: expr.ident(`/* @todo typeMapper(${type}) */`),
    };
  }

  private typeValidator(type: Type): Expression {
    if (type.equals(CDK_CORE.CfnTag)) {
      return CDK_CORE.validateCfnTag;
    }

    switch (type.primitive) {
      case PrimitiveType.String:
        return CDK_CORE.validateString;
      case PrimitiveType.Date:
        return CDK_CORE.validateDate;
      case PrimitiveType.Number:
        return CDK_CORE.validateNumber;
      case PrimitiveType.Json:
        return CDK_CORE.validateObject;
      case PrimitiveType.Any:
        return CDK_CORE.validateObject;
      case PrimitiveType.Boolean:
        return CDK_CORE.validateBoolean;
    }

    if (type.arrayOfType) {
      return CDK_CORE.listValidator.call(this.typeValidator(type.arrayOfType));
    }

    if (type.mapOfType) {
      return CDK_CORE.hashValidator.call(this.typeValidator(type.mapOfType));
    }

    if (type.unionOfTypes) {
      return CDK_CORE.unionValidator.call(...type.unionOfTypes.map((t) => this.typeValidator(t)));
    }

    if (type.symbol) {
      return expr.sym(new ThingSymbol(cfnPropsValidatorNameFromType(type.symbol.name), this.mapperFunctionsScope));
    }

    throw `Error: unresolved typeValidator(${type})`;
  }
}

interface Mapper {
  readonly produce: Expression;
  readonly parse: Expression;
}
