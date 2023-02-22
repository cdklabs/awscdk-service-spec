/* eslint-disable import/no-extraneous-dependencies */
import { PropertyType } from '@aws-cdk/service-spec';
import { TypeReferenceSpec } from '@cdklabs/typewriter';
import * as jsii from '@jsii/spec';

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
