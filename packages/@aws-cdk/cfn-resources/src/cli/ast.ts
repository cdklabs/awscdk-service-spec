import { DatabaseSchema, Property, PropertyType, Resource, TypeDefinition } from '@aws-cdk/service-spec';
import { Database } from '@cdklabs/tskb';
import { Callable, Case, StructType, MemberKind, TypeReferenceSpec, stmt, TypeKind } from '@cdklabs/typewriter';
import { DocsSpec } from '@cdklabs/typewriter/src/documented';
import * as jsii from '@jsii/spec';
import { Stability } from '@jsii/spec';
import { CdkCore } from './cdk';
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

  protected readonly core: CdkCore;

  protected constructor(public readonly scope: ResourceModule, public readonly db: Database<DatabaseSchema>) {
    this.core = new CdkCore('aws-cdk-lib', scope);
  }

  public addResource(r: Resource) {
    const propsInterface = new StructType(this.scope, {
      export: true,
      name: `Cfn${r.name}Props`,
      kind: TypeKind.Interface,
      docs: {
        ...splitDocumentation(r.documentation),
        stability: Stability.External,
      },
    });
    for (const [name, prop] of Object.entries(r.properties)) {
      this.addResourceProperty(propsInterface, name, prop);
    }
  }

  protected addResourceProperty(propsInterface: StructType, name: string, property: Property) {
    propsInterface.addProperty({
      kind: MemberKind.Property,
      name: Case.firstCharToLower(name),
      type: this.propertyTypeToTypeReferenceSpec(property.type),
      immutable: true,
      docs: {
        ...splitDocumentation(property.documentation),
      },
    });

    const propToCfn = new Callable(this.scope, {
      kind: TypeKind.Function,
      name: `cfn${this.scope.resource}${name}PropertyToCloudFormation`,
      parameters: [
        {
          name: 'properties',
          type: {
            primitive: jsii.PrimitiveType.Any,
          },
        },
      ],
      returnType: {
        primitive: jsii.PrimitiveType.Any,
      },
    });
    propToCfn.body.add(
      stmt.ret(
        stmt.object({
          // @TODO this needs to iterate over the properties on the type
          Manifest: this.core.objectToCloudFormation(stmt.sym('properties').asObject().prop('manifest')),
        }),
      ),
    );
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
    try {
      return this.scope.findType(ref.name);
    } catch {
      return this.createTypeReference(ref);
    }
  }

  private createTypeReference(ref: TypeDefinition) {
    // We need to first create the Interface without properties, in case of a recursive type.
    // This way when a property is added that recursively uses the type, it already exists (albeit without properties) and can be referenced
    const theType = new StructType(this.scope, {
      export: true,
      name: ref.name,
      kind: TypeKind.Interface,
      docs: {
        ...splitDocumentation(ref.documentation),
      },
    });
    Object.entries(ref.properties).forEach(([name, p]) =>
      theType.addProperty({
        kind: MemberKind.Property,
        name: Case.firstCharToLower(name),
        type: this.propertyTypeToTypeReferenceSpec(p.type),
        immutable: true,
        docs: {
          ...splitDocumentation(p.documentation),
        },
      }),
    );

    return theType;
  }
}

function splitDocumentation(x: string | undefined): Pick<DocsSpec, 'summary' | 'remarks'> {
  const [summary, remarks] = splitSummary(x);
  return { summary, remarks };
}
