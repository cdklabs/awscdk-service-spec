import { DatabaseSchema, PropertyType, Resource } from '@aws-cdk/service-spec';
import { Database } from '@cdklabs/tskb';
import { Case, InterfaceSpec, InterfaceType, MemberKind, Module, TypeReferenceSpec } from '@cdklabs/typewriter';
import * as jsii from '@jsii/spec';
import { ServiceModule } from './service';

export class AstBuilder<T extends Module> {
  /**
   * @deprecated should be replaced by a new forService once services are available
   */
  public static forResource(resource: string, db: Database<DatabaseSchema>): AstBuilder<ServiceModule> {
    const resourceId = resource.split('::').slice(1).join('.').toLowerCase();
    const scope = new ServiceModule(resourceId);

    return new AstBuilder<ServiceModule>(scope, db);
  }

  protected constructor(public readonly scope: T, public readonly db: Database<DatabaseSchema>) {}

  public addResource(r: Resource) {
    new InterfaceType(this.scope, this.resourcePropsSpec(r));
  }

  protected resourcePropsSpec(r: Resource): InterfaceSpec {
    const propsInterface = `Cfn${r.name}Props`;

    return {
      export: true,
      name: propsInterface,
      kind: jsii.TypeKind.Interface,
      properties: Object.entries(r.properties).map(([name, p]) => ({
        kind: MemberKind.Property,
        name: Case.firstCharToLower(name),
        type: this.propertyTypeToTypeReferenceSpec(p.type),
        immutable: true,
      })),
    };
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
      case 'json':
      default:
        return {
          primitive: jsii.PrimitiveType.Any,
        };
    }
  }
}
