import { DatabaseSchema, Property, PropertyType, Resource } from '@aws-cdk/service-spec';
import { Database } from '@cdklabs/tskb';
import { Callable, Case, InterfaceType, MemberKind, TypeReferenceSpec, stmt, TypeKind } from '@cdklabs/typewriter';
import * as jsii from '@jsii/spec';
import { CdkCore } from './cdk';
import { ResourceModule } from './resource';

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
    const propsInterface = new InterfaceType(this.scope, {
      export: true,
      name: `Cfn${r.name}Props`,
      kind: TypeKind.Interface,
    });
    for (const [name, prop] of Object.entries(r.properties)) {
      this.addResourceProperty(propsInterface, name, prop);
    }
  }

  protected addResourceProperty(propsInterface: InterfaceType, name: string, property: Property) {
    propsInterface.addProperty({
      kind: MemberKind.Property,
      name: Case.firstCharToLower(name),
      type: this.propertyTypeToTypeReferenceSpec(property.type),
      immutable: true,
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
    propToCfn.body = [
      stmt.ret(
        stmt.object({
          // @TODO this needs to iterate over the properties on the type
          Manifest: this.core.objectToCloudFormation(stmt.sym('properties').asObject().prop('manifest')),
        }),
      ),
    ];
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
        try {
          return this.scope.findType(ref.name);
        } catch {
          // We need to first create the Interface without properties, in case of a recursive type.
          // This way when a property is added that recursively uses the type, it already exists (albeit without properties) and can be referenced
          const theType = new InterfaceType(this.scope, {
            export: true,
            name: ref.name,
            kind: TypeKind.Interface,
          });
          Object.entries(ref.properties).forEach(([name, p]) =>
            theType.addProperty({
              kind: MemberKind.Property,
              name: Case.firstCharToLower(name),
              type: this.propertyTypeToTypeReferenceSpec(p.type),
              immutable: true,
            }),
          );

          return theType;
        }
      case 'json':
      default:
        return {
          primitive: jsii.PrimitiveType.Any,
        };
    }
  }
}
