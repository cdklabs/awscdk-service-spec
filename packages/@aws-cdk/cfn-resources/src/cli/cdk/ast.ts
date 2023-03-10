import { DatabaseSchema, Deprecation, Property, PropertyType, Resource, TypeDefinition } from '@aws-cdk/service-spec';
import { Database } from '@cdklabs/tskb';
import { StructType, expr, stmt, Type, TypeDeclaration, FreeFunction } from '@cdklabs/typewriter';
import { Stability } from '@jsii/spec';
import { CDK_CORE, CONSTRUCTS } from './cdk';
import { ResourceClass } from './resource-class';
import {
  classNameFromResource,
  mapperNameFromType,
  propertyNameFromCloudFormation,
  propStructNameFromResource,
  structNameFromTypeDefinition,
} from '../naming/conventions';
import { cloudFormationDocLink } from '../naming/doclink';
import { PropMapping } from '../prop-mapping';
import { ResourceModule } from '../resource';
import { splitDocumentation } from '../split-summary';

export class AstBuilder {
  /**
   * @deprecated should be replaced by a new forService once services are available
   */
  public static forResource(resource: string, db: Database<DatabaseSchema>): AstBuilder {
    const parts = resource.split('::');
    const scope = new ResourceModule(parts[1], parts[2]);

    return new AstBuilder(scope, db);
  }

  protected constructor(public readonly scope: ResourceModule, public readonly db: Database<DatabaseSchema>) {
    CDK_CORE.import(scope, 'cdk');
    CONSTRUCTS.import(scope, 'constructs');
    CDK_CORE.helpers.import(scope, 'cfn_parse');
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
    const mapping = new PropMapping();
    for (const [name, prop] of Object.entries(r.properties)) {
      this.addStructProperty(propsInterface, mapping, name, prop, r);
    }

    this.makeStructMapper(propsInterface, mapping);
    return propsInterface;
  }

  protected makeStructMapper(propsInterface: StructType, mapping: PropMapping) {
    const propToCfn = new FreeFunction(this.scope, {
      name: mapperNameFromType(propsInterface),
      parameters: [
        {
          name: 'properties',
          type: propsInterface.type,
        },
      ],
      returnType: Type.ANY,
    });

    const propsObj = expr.ident('properties');

    propToCfn.addBody(
      stmt.if_(expr.not(CDK_CORE.canInspect(propsObj))).then(stmt.ret(propsObj)),
      // FIXME: Validation here
      stmt.ret(expr.object(mapping.cfnProperties().map((cfn) => [cfn, mapping.mapProp(cfn, propsObj)] as const))),
    );

    return propToCfn;
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

    const mapping = new PropMapping();
    Object.entries(def.properties).forEach(([name, p]) => {
      this.addStructProperty(theType, mapping, name, p, def);
    });

    this.makeStructMapper(theType, mapping);

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
