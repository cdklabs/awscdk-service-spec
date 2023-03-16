import {
  DatabaseSchema,
  Deprecation,
  Property,
  PropertyType,
  Resource,
  Service,
  TypeDefinition,
} from '@aws-cdk/service-spec';
import { Database } from '@cdklabs/tskb';
import { StructType, expr, stmt, Type, TypeDeclaration, FreeFunction, IsObject, $E } from '@cdklabs/typewriter';
import { Stability } from '@jsii/spec';
import { ModuleImports } from './cdk';
import { ResourceClass } from './resource-class';
import { AwsCdkLibModule, ResourceModule, ServiceModule } from '../modules';
import {
  classNameFromResource,
  cfnProducerNameFromType,
  propertyNameFromCloudFormation,
  propStructNameFromResource,
  cfnParserNameFromType,
  structNameFromTypeDefinition,
} from '../naming/conventions';
import { cloudFormationDocLink } from '../naming/doclink';
import { PropMapping } from '../prop-mapping';
import { splitDocumentation } from '../split-summary';

export interface AstBuilderProps {
  readonly db: Database<DatabaseSchema>;
  /**
   * The import names used to import modules
   */
  readonly importNames?: ModuleImports;
}

export class AstBuilder<T extends AwsCdkLibModule> {
  public static forService(service: Service, props: AstBuilderProps): AstBuilder<ServiceModule> {
    const scope = new ServiceModule(service.name, service.shortName, props.importNames);
    const ast = new AstBuilder(scope, props.db);

    const resources = props.db.follow('hasResource', service);
    for (const link of resources) {
      ast.addResource(link.to);
    }

    return ast;
  }

  public static forResource(resource: Resource, props: AstBuilderProps): AstBuilder<ResourceModule> {
    const parts = resource.cloudFormationType.toLowerCase().split('::');
    const scope = new ResourceModule(parts[1], parts[2], props.importNames);

    const ast = new AstBuilder(scope, props.db);
    ast.addResource(resource);

    return ast;
  }

  protected constructor(public readonly scope: T, public readonly db: Database<DatabaseSchema>) {
    this.scope.CDK_CORE.import(scope, 'cdk');
    this.scope.CONSTRUCTS.import(scope, 'constructs');
    this.scope.CDK_CORE.helpers.import(scope, 'cfn_parse');
  }

  public addResource(r: Resource) {
    const propsType = this.addResourcePropsType(r);

    new ResourceClass(this.scope, {
      res: r,
      propsType,
      typeHost: {
        typeFromSpecType: this.typeFromSpecType.bind(this),
      },
    });
  }

  protected addResourcePropsType(r: Resource) {
    const propsInterface = new StructType(this.scope, {
      export: true,
      name: propStructNameFromResource(r),
      docs: {
        summary: `Properties for defining a \`${classNameFromResource(r)}\``,
        stability: Stability.External,
        see: cloudFormationDocLink({
          resourceType: r.cloudFormationType,
        }),
      },
    });
    const mapping = new PropMapping(this.scope);
    for (const [name, prop] of Object.entries(r.properties)) {
      this.addStructProperty(propsInterface, mapping, name, prop, r);
    }

    this.makeCfnProducer(propsInterface, mapping);
    this.makeCfnParser(propsInterface, mapping);
    return propsInterface;
  }

  /**
   * Make the function that translates code -> CFN
   */
  protected makeCfnProducer(propsInterface: StructType, mapping: PropMapping) {
    const producer = new FreeFunction(this.scope, {
      name: cfnProducerNameFromType(propsInterface),
      returnType: Type.ANY,
    });

    const propsObj = producer.addParameter({
      name: 'properties',
      type: Type.ANY,
    });

    producer.addBody(
      stmt.if_(expr.not(this.scope.CDK_CORE.canInspect(propsObj))).then(stmt.ret(propsObj)),
      // FIXME: Validation here
      stmt.ret(
        expr.object(mapping.cfnProperties().map((cfn) => [cfn, mapping.produceProperty(cfn, propsObj)] as const)),
      ),
    );

    return producer;
  }

  /**
   * Make the function that translates CFN -> code
   */
  protected makeCfnParser(propsInterface: StructType, mapping: PropMapping) {
    const parser = new FreeFunction(this.scope, {
      name: cfnParserNameFromType(propsInterface),
      returnType: this.scope.CDK_CORE.helpers.FromCloudFormationResult.withGenericArguments(propsInterface.type),
    });

    const propsObj = parser.addParameter({
      name: 'properties',
      type: Type.ANY,
    });

    const $ret = $E(expr.ident('ret'));

    parser.addBody(
      stmt.assign(propsObj, expr.cond(expr.binOp(propsObj, '==', expr.NULL)).then(expr.lit({})).else(propsObj)),
      stmt
        .if_(expr.not(new IsObject(propsObj)))
        .then(stmt.ret(new this.scope.CDK_CORE.helpers.FromCloudFormationResult(propsObj))),

      stmt.constVar(
        $ret,
        this.scope.CDK_CORE.helpers.FromCloudFormationPropertyObject.withGenericArguments(
          propsInterface.type,
        ).newInstance(),
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

  protected typeFromSpecType(type: PropertyType): Type {
    switch (type?.type) {
      case 'string':
        return Type.STRING;
      case 'number':
        return Type.NUMBER;
      case 'boolean':
        return Type.BOOLEAN;
      case 'array':
        return Type.arrayOf(this.typeFromSpecType(type.element));
      case 'map':
        return Type.mapOf(this.typeFromSpecType(type.element));
      case 'ref':
        const ref = this.db.get('typeDefinition', type.reference.$ref);
        return this.obtainTypeReference(ref).type;
      case 'json':
      default:
        return Type.ANY;
    }
  }

  private obtainTypeReference(ref: TypeDefinition): TypeDeclaration {
    const ret = this.scope.tryFindType(structNameFromTypeDefinition(ref));
    return ret ?? this.createTypeReference(ref);
  }

  private createTypeReference(def: TypeDefinition) {
    // We need to first create the Interface without properties, in case of a recursive type.
    // This way when a property is added that recursively uses the type, it already exists (albeit without properties) and can be referenced
    const theType = new StructType(this.scope, {
      export: true,
      name: structNameFromTypeDefinition(def),
      docs: {
        ...splitDocumentation(def.documentation),
        see: cloudFormationDocLink({
          resourceType: this.resourceOfType(def).cloudFormationType,
          propTypeName: def.name,
        }),
      },
    });

    const mapping = new PropMapping(this.scope);
    Object.entries(def.properties).forEach(([name, p]) => {
      this.addStructProperty(theType, mapping, name, p, def);
    });

    this.makeCfnProducer(theType, mapping);
    this.makeCfnParser(theType, mapping);

    return theType;
  }

  private addStructProperty(
    struct: StructType,
    map: PropMapping,
    propertyName: string,
    property: Property,
    parent: Resource | TypeDefinition,
  ) {
    let resource: Resource;
    let propTypeName: string | undefined;
    if (isResource(parent)) {
      resource = parent;
    } else {
      resource = this.resourceOfType(parent);
      propTypeName = parent.name;
    }

    const name = propertyNameFromCloudFormation(propertyName);
    const type = this.typeFromSpecType(property.type);

    map.add(propertyName, name, type);

    struct.addProperty({
      name,
      type,
      optional: !property.required,
      docs: {
        ...splitDocumentation(property.documentation),
        default: property.defaultValue ?? undefined,
        see: cloudFormationDocLink({
          resourceType: resource.cloudFormationType,
          propTypeName,
          propName: propertyName,
        }),
        deprecated: deprecationMessage(),
      },
    });

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
   * Return the resource that a type definition belongs to
   */
  private resourceOfType(ref: TypeDefinition) {
    return this.db.incoming('usesType', ref).only().from;
  }
}

function isResource(x: Resource | TypeDefinition): x is Resource {
  return !!(x as Resource).cloudFormationType;
}
