import { PropertyType } from '@aws-cdk/service-spec-types';

export function maybeUnion(types: PropertyType[]): PropertyType {
  switch (types.length) {
    case 0:
      throw new Error('Oops, no types');
    case 1:
      return types[0];
    default:
      return { type: 'union', types };
  }
}
