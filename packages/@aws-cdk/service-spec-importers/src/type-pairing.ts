import {
  Attribute,
  Property,
  PropertyType,
  Resource,
  RichPropertyType,
  RichTypedField,
  SpecDatabase,
  TypeDefinition,
} from '@aws-cdk/service-spec-types';

/**
 * Pair the type definitions of one resource in two databases by where they are used
 *
 * A type definition of `fromResource` is paired with every type definition of `toResource` that has the same
 * name, or that occurs at the same position: the same resource property or attribute, and then the same field
 * names, through any entry of the type histories on either side. At a position, two types pair their type
 * definitions only if they have the same shape (see `matchShape`) and each pair of type definitions has the same
 * name or shares a field. So a type definition that CloudFormation moved into an array, a map or a union, or
 * replaced with an unrelated one, is not paired there.
 *
 * Returns, for each type definition id of `fromDb`, the paired type definitions of `toDb`.
 */
export function pairTypeDefinitions(
  fromDb: SpecDatabase,
  fromResource: Resource,
  toDb: SpecDatabase,
  toResource: Resource,
): Map<string, Set<TypeDefinition>> {
  const ret = new Map<string, Set<TypeDefinition>>();
  const queue = new Array<[TypeDefinition, TypeDefinition]>();

  const pair = (from: TypeDefinition, to: TypeDefinition) => {
    let paired = ret.get(from.$id);
    if (!paired) {
      paired = new Set();
      ret.set(from.$id, paired);
    }
    if (!paired.has(to)) {
      paired.add(to);
      queue.push([from, to]);
    }
  };

  const pairFields = (from: Property | Attribute, to: Property | Attribute) => {
    const toTypes = new RichTypedField(to).types();
    for (const fromType of new RichTypedField(from).types()) {
      for (const toType of toTypes) {
        const pairs = matchShape(fromDb, fromType, toDb, toType, sameNameOrSharedField);
        for (const [fromTypeDef, toTypeDef] of pairs ?? []) {
          pair(fromTypeDef, toTypeDef);
        }
      }
    }
  };

  const toByName = new Map(toDb.follow('usesType', toResource).map(({ entity }) => [entity.name, entity]));
  for (const { entity } of fromDb.follow('usesType', fromResource)) {
    const sameName = toByName.get(entity.name);
    if (sameName) {
      pair(entity, sameName);
    }
  }

  for (const bag of ['properties', 'attributes'] as const) {
    for (const [name, field] of Object.entries(fromResource[bag])) {
      const other = toResource[bag][name];
      if (other) {
        pairFields(field, other);
      }
    }
  }

  while (queue.length > 0) {
    const [from, to] = queue.pop()!;
    for (const [name, field] of Object.entries(from.properties)) {
      const other = to.properties[name];
      if (other) {
        pairFields(field, other);
      }
    }
  }

  return ret;
}

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
function sameNameOrSharedField(from: TypeDefinition, to: TypeDefinition) {
  const fields = Object.keys(from.properties);
  return from.name === to.name || fields.length === 0 || fields.some((name) => to.properties[name]);
}

/**
 * The type definitions a type refers to, looking into collections and unions
 */
export function referencedTypeDefinitions(db: SpecDatabase, type: PropertyType): TypeDefinition[] {
  switch (type.type) {
    case 'array':
    case 'map':
      return referencedTypeDefinitions(db, type.element);
    case 'union':
      return type.types.flatMap((t) => referencedTypeDefinitions(db, t));
    case 'ref':
      return [db.get('typeDefinition', type.reference)];
    default:
      return [];
  }
}
