import { PropertyType, RichPropertyType, SpecDatabase, TypeDefinition } from '@aws-cdk/service-spec-types';

/**
 * The type definitions at the same places of two types with the same shape, or undefined if their shapes differ
 *
 * Two types have the same shape if they have the same primitive types (integers and numbers are the same, as in L1
 * code) and matching type definitions in the same arrays, maps and unions. Two unions have the same shape if they
 * have as many members and every member of each has the same shape as a member of the other. `sameTypeDefinition`
 * decides which type definitions match.
 */
export function matchShape(
  fromDb: SpecDatabase,
  from: PropertyType,
  toDb: SpecDatabase,
  to: PropertyType,
  sameTypeDefinition: (from: TypeDefinition, to: TypeDefinition) => boolean,
): Array<[TypeDefinition, TypeDefinition]> | undefined {
  switch (from.type) {
    case 'array':
    case 'map':
      return to.type === from.type ? matchShape(fromDb, from.element, toDb, to.element, sameTypeDefinition) : undefined;
    case 'union': {
      if (to.type !== 'union' || to.types.length !== from.types.length) {
        return undefined;
      }
      const matches = from.types.flatMap((fromMember, i) =>
        to.types.flatMap((toMember, j) => {
          const pairs = matchShape(fromDb, fromMember, toDb, toMember, sameTypeDefinition);
          return pairs ? [{ i, j, pairs }] : [];
        }),
      );
      const everyMatched =
        from.types.every((_, i) => matches.some((m) => m.i === i)) &&
        to.types.every((_, j) => matches.some((m) => m.j === j));
      return everyMatched ? matches.flatMap((m) => m.pairs) : undefined;
    }
    case 'ref': {
      if (to.type !== 'ref') {
        return undefined;
      }
      const fromTypeDef = fromDb.get('typeDefinition', from.reference);
      const toTypeDef = toDb.get('typeDefinition', to.reference);
      return sameTypeDefinition(fromTypeDef, toTypeDef) ? [[fromTypeDef, toTypeDef]] : undefined;
    }
    default:
      return new RichPropertyType(from).javascriptEquals(to) ? [] : undefined;
  }
}

/**
 * Whether two type definitions at the same position can be the same L1 type: same name, or a shared field
 *
 * A type definition without fields can be the same as any other.
 */
export function sameNameOrSharedField(from: TypeDefinition, to: TypeDefinition) {
  const fields = Object.keys(from.properties);
  return from.name === to.name || fields.length === 0 || fields.some((name) => to.properties[name]);
}
