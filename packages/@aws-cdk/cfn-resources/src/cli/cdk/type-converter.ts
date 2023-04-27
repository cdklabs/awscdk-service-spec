import { SpecDatabase, Deprecation, Property, PropertyType, Resource, TypeDefinition } from '@aws-cdk/service-spec';
import {
  $E,
  ClassType,
  expr,
  FreeFunction,
  IScope,
  IsObject,
  Module,
  PrimitiveType,
  RichScope,
  stmt,
  StructType,
  Type,
  TypeDeclaration,
} from '@cdklabs/typewriter';
import { CDK_CORE } from './cdk';
import { PropertyValidator } from './property-validator';
import {
  cfnParserNameFromType,
  cfnProducerNameFromType,
  propertyNameFromCloudFormation,
  structNameFromTypeDefinition,
} from '../naming/conventions';
import { cloudFormationDocLink } from '../naming/doclink';
import { PropMapping } from '../prop-mapping';
import { splitDocumentation } from '../split-summary';

export interface TypeConverterOptions {
  readonly db: SpecDatabase;
  readonly resourceClass: ClassType;
  readonly resource: Resource;
}

/**
 * Convert types from the resource model to the code generator model
 */
export class TypeConverter {
  private readonly db: SpecDatabase;
  private readonly module: Module;
  private readonly resourceClass: ClassType;
  private readonly resource: Resource;

  constructor(options: TypeConverterOptions) {
    this.db = options.db;
    this.resource = options.resource;
    this.resourceClass = options.resourceClass;
    this.module = Module.of(this.resourceClass);
  }

  public typeFromSpecType(type: PropertyType): Type {
    switch (type?.type) {
      case 'string':
        return Type.STRING;
      case 'number':
        return Type.NUMBER;
      case 'boolean':
        return Type.BOOLEAN;
      case 'date-time':
        return Type.DATE_TIME;
      case 'array':
        return Type.arrayOf(this.typeFromSpecType(type.element));
      case 'map':
        return Type.mapOf(this.typeFromSpecType(type.element));
      case 'ref':
        const ref = this.db.get('typeDefinition', type.reference.$ref);
        return this.obtainTypeReference(ref).type;
      case 'builtIn':
        switch (type.builtInType) {
          case 'tag':
            return CDK_CORE.CfnTag;
        }
      case 'union':
        return Type.unionOf(...type.types.map((t) => this.typeFromSpecType(t)));
      case 'json':
      default:
        return Type.ANY;
    }
  }

  private obtainTypeReference(ref: TypeDefinition): TypeDeclaration {
    const scope = this.resourceClass;
    const ret = new RichScope(scope).tryFindTypeByName(structNameFromTypeDefinition(ref));
    return ret ?? this.createTypeReference(scope, ref);
  }

  private createTypeReference(scope: IScope, def: TypeDefinition) {
    // We need to first create the Interface without properties, in case of a recursive type.
    // This way when a property is added that recursively uses the type, it already exists (albeit without properties) and can be referenced
    const theType = new StructType(scope, {
      export: true,
      name: structNameFromTypeDefinition(def),
      docs: {
        ...splitDocumentation(def.documentation),
        see: cloudFormationDocLink({
          resourceType: this.resource.cloudFormationType,
          propTypeName: def.name,
        }),
      },
    });

    const mapping = new PropMapping(this.module);
    Object.entries(def.properties).forEach(([name, p]) => {
      this.addStructProperty(theType, mapping, name, p, def);
    });

    this.makeCfnProducer(theType, mapping);
    this.makeCfnParser(theType, mapping);

    return theType;
  }

  /**
   * Add a property to a given struct
   *
   * The property either models a resource property (default), or a field of a property
   * type (`propertyFromType` is given).
   */
  public addStructProperty(
    struct: StructType,
    map: PropMapping,
    propertyName: string,
    property: Property,
    propertyFromType?: TypeDefinition,
  ) {
    const propTypeName = propertyFromType?.name;

    const name = propertyNameFromCloudFormation(propertyName);
    const type = this.typeFromSpecType(property.type);

    const spec = {
      name,
      type,
      optional: !property.required,
      docs: {
        ...splitDocumentation(property.documentation),
        default: property.defaultValue ?? undefined,
        see: cloudFormationDocLink({
          resourceType: this.resource.cloudFormationType,
          propTypeName,
          propName: propertyName,
        }),
        deprecated: deprecationMessage(),
      },
    };

    struct.addProperty({
      ...spec,
      type: this.makeTypeResolvable(type),
    });

    map.add(propertyName, spec);

    function deprecationMessage(): string | undefined {
      switch (property.deprecated) {
        case Deprecation.WARN:
          return 'this property has been deprecated';
        case Deprecation.IGNORE:
          return 'this property will be ignored';
      }

      return undefined;
    }
  }

  /**
   * Make the function that translates code -> CFN
   */
  public makeCfnProducer(propsInterface: StructType, mapping: PropMapping) {
    const validator = new PropertyValidator(this.module, {
      type: propsInterface,
      mapping,
    });

    const producer = new FreeFunction(this.module, {
      name: cfnProducerNameFromType(propsInterface),
      returnType: Type.ANY,
    });

    const propsObj = producer.addParameter({
      name: 'properties',
      type: Type.ANY,
    });

    producer.addBody(
      stmt.if_(expr.not(CDK_CORE.canInspect(propsObj))).then(stmt.ret(propsObj)),
      validator.fn.call(propsObj).callMethod('assertSuccess'),
      stmt.ret(
        expr.object(mapping.cfnProperties().map((cfn) => [cfn, mapping.produceProperty(cfn, propsObj)] as const)),
      ),
    );

    return producer;
  }

  /**
   * Make the function that translates CFN -> code
   */
  public makeCfnParser(propsInterface: StructType, mapping: PropMapping) {
    const parserType = Type.unionOf(propsInterface.type, CDK_CORE.IResolvable);

    const parser = new FreeFunction(this.module, {
      name: cfnParserNameFromType(propsInterface),
      returnType: CDK_CORE.helpers.FromCloudFormationResult.withGenericArguments(parserType),
    });

    const propsObj = parser.addParameter({
      name: 'properties',
      type: Type.ANY,
    });

    const $ret = $E(expr.ident('ret'));

    parser.addBody(
      stmt
        .if_(CDK_CORE.isResolvableObject(propsObj))
        .then(stmt.block(stmt.ret(new CDK_CORE.helpers.FromCloudFormationResult(propsObj)))),
      stmt.assign(propsObj, expr.cond(expr.binOp(propsObj, '==', expr.NULL)).then(expr.lit({})).else(propsObj)),
      stmt
        .if_(expr.not(new IsObject(propsObj)))
        .then(stmt.block(stmt.ret(new CDK_CORE.helpers.FromCloudFormationResult(propsObj)))),

      stmt.constVar(
        $ret,
        CDK_CORE.helpers.FromCloudFormationPropertyObject.withGenericArguments(propsInterface.type).newInstance(),
      ),

      ...mapping
        .cfnFromTs()
        .map(([cfnName, tsName]) =>
          $ret.addPropertyResult(expr.lit(tsName), expr.lit(cfnName), mapping.parseProperty(cfnName, propsObj)),
        ),

      $ret.addUnrecognizedPropertiesAsExtra(propsObj),
      stmt.ret($ret),
    );

    return parser;
  }

  /**
   * For a given type, returned a resolvable version of the type
   *
   * We do this by checking if the type can be represented directly by a Token (e.g. `Token.asList(value))`).
   * If not we recursively apply a type union with `cdk.IResolvable` to the type.
   */
  private makeTypeResolvable(type: Type): Type {
    if (isTokenizableType(type) || isTagType(type)) {
      return type;
    }

    if (type.primitive) {
      return Type.unionOf(type, CDK_CORE.IResolvable);
    }

    if (type.arrayOfType) {
      return Type.unionOf(Type.arrayOf(this.makeTypeResolvable(type.arrayOfType)), CDK_CORE.IResolvable);
    }

    if (type.mapOfType) {
      return Type.unionOf(Type.mapOf(this.makeTypeResolvable(type.mapOfType)), CDK_CORE.IResolvable);
    }

    if (type.unionOfTypes) {
      return Type.unionOf(...type.unionOfTypes, CDK_CORE.IResolvable);
    }

    return Type.unionOf(type, CDK_CORE.IResolvable);
  }
}

/**
 * Is the given type a builtin tag
 */
function isTagType(type: Type): boolean {
  return type.fqn === CDK_CORE.CfnTag.fqn || type.arrayOfType?.fqn === CDK_CORE.CfnTag.fqn;
}

/**
 * Only string, string[] and number can be represented by a token
 */
function isTokenizableType(type: Type): boolean {
  return (
    type.primitive === PrimitiveType.String ||
    type.arrayOfType?.primitive === PrimitiveType.String ||
    type.primitive === PrimitiveType.Number
  );
}
