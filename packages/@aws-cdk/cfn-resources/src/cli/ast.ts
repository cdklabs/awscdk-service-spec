import { DatabaseSchema, Deprecation, Property, PropertyType, Resource, TypeDefinition } from '@aws-cdk/service-spec';
import { Database } from '@cdklabs/tskb';
import { Callable, StructType, TypeReferenceSpec, expr, stmt, Type, AliasedModuleImport } from '@cdklabs/typewriter';
import { DocsSpec } from '@cdklabs/typewriter/src/documented';
import * as jsii from '@jsii/spec';
import { Stability } from '@jsii/spec';
import { CDK_CORE } from './cdk';
import {
  propertyNameFromCloudFormation,
  propStructNameFromResource,
  structNameFromTypeDefinition,
} from './naming/conventions';
import { cloudFormationDocLink } from './naming/doclink';
import { PropMapping } from './prop-mapping';
import { ResourceModule } from './resource';
import { splitSummary } from './split-summary';

export class AstBuilder {
  /**
   * @deprecated should be replaced by a new forService once services are available
   */
  public static forResource(resource: string, db: Database<DatabaseSchema>): AstBuilder {
    const parts = resource.split('::');
    const scope = new ResourceModule(parts[1], parts[2]);

    return new AstBuilder(scope, db);
  }

  private core: AliasedModuleImport;

  protected constructor(public readonly scope: ResourceModule, public readonly db: Database<DatabaseSchema>) {
    this.core = CDK_CORE.import(scope, 'cdk');
  }

  public addResource(r: Resource) {
    const propsInterface = new StructType(this.scope, {
      export: true,
      name: propStructNameFromResource(r),
      docs: {
        ...splitDocumentation(r.documentation),
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
  }

  protected makeStructMapper(propsInterface: StructType, mapping: PropMapping) {
    const propToCfn = new Callable(this.scope, {
      name: `convert${propsInterface.name}ToCloudFormation`,
      parameters: [
        {
          name: 'properties',
          type: propsInterface.type,
        },
      ],
      returnType: Type.any(this.scope),
    });

    const propsObj = expr.sym('properties').asObject();

    propToCfn.body.add(
      stmt.if_(expr.not(this.core.invoke('canInspect', propsObj))).then(stmt.ret(propsObj)),
      // FIXME: Validation here
      stmt.ret(expr.object(mapping.cfnFromTs().map(([cfn, ts]) => [cfn, propsObj.prop(ts)] as const))),
    );

    return propToCfn;
  }

  protected propertyTypeToTypeReferenceSpec(type: PropertyType): TypeReferenceSpec {
    switch (type?.type) {
      case 'string':
      case 'number':
      case 'boolean':
        return {
          primitive: type.type as jsii.PrimitiveType,
        };
      case 'array':
        return {
          collection: {
            kind: jsii.CollectionKind.Array,
            elementtype: this.propertyTypeToTypeReferenceSpec(type.element) as any,
          },
        };
      case 'map':
        return {
          collection: {
            kind: jsii.CollectionKind.Map,
            elementtype: this.propertyTypeToTypeReferenceSpec(type.element) as any,
          },
        };
      case 'ref':
        const ref = this.db.get('typeDefinition', type.reference.$ref);
        return this.obtainTypeReference(ref);
      case 'json':
      default:
        return {
          primitive: jsii.PrimitiveType.Any,
        };
    }
  }

  private obtainTypeReference(ref: TypeDefinition) {
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

    map.add(propertyName, propertyNameFromCloudFormation(propertyName));

    struct.addProperty({
      name: propertyNameFromCloudFormation(propertyName),
      type: this.propertyTypeToTypeReferenceSpec(property.type),
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

function splitDocumentation(x: string | undefined): Pick<DocsSpec, 'summary' | 'remarks'> {
  const [summary, remarks] = splitSummary(x);
  return { summary, remarks };
}

function isResource(x: Resource | TypeDefinition): x is Resource {
  return !!(x as Resource).cloudFormationType;
}
