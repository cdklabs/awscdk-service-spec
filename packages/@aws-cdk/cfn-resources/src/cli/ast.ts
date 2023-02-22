import { PropertyType, Resource } from '@aws-cdk/service-spec';
import { Case, InterfaceSpec, MemberKind, TypeReferenceSpec } from '@cdklabs/typewriter';
import * as jsii from '@jsii/spec';

export function resourcePropsSpec(r: Resource): InterfaceSpec {
  const propsInterface = `Cfn${r.name}Props`;

  return {
    export: true,
    name: propsInterface,
    kind: jsii.TypeKind.Interface,
    properties: Object.entries(r.properties).map(([name, p]) => ({
      kind: MemberKind.Property,
      name: Case.firstCharToLower(name),
      type: propertyTypeToTypeReferenceSpec(p.type),
      immutable: true,
    })),
  };
}

export function propertyTypeToTypeReferenceSpec(type: PropertyType): TypeReferenceSpec {
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
          elementtype: propertyTypeToTypeReferenceSpec(type.element) as any,
        },
      };
    case 'map':
      return {
        collection: {
          kind: jsii.CollectionKind.Map,
          elementtype: propertyTypeToTypeReferenceSpec(type.element) as any,
        },
      };
    case 'json':
    default:
      return {
        primitive: jsii.PrimitiveType.Any,
      };
  }
}
