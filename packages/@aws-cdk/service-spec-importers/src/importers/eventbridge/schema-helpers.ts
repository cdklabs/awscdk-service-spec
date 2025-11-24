import { PropertyType, RichPropertyType } from '@aws-cdk/service-spec-types';

/**
 * Check if a schema represents an empty object type
 * An empty object type has type: "object" but no properties field
 */
export function isEmptyObjectType(schema: any): boolean {
  return schema.type === 'object' && !schema.properties;
}

/**
 * Navigate to the detail type definition in an EventBridge schema
 * Follows the $ref path from AWSEvent.properties.detail to find the actual detail type schema
 *
 * @returns Object containing the detail type schema and its name
 */
export function extractDetailTypeFromSchema(eventContent: any): { schema: any; typeName: string } {
  const parts = eventContent.components.schemas.AWSEvent.properties.detail.$ref.substring(2).split('/');
  let current = eventContent;
  let lastKey: string | undefined;

  while (parts.length > 0) {
    lastKey = parts.shift()!;
    // @ts-ignore
    current = current[lastKey];
  }

  return {
    schema: current,
    typeName: lastKey!,
  };
}

/**
 * Derive a 'required' array from the oneOfs/anyOfs/allOfs in this source
 */
export function calculateDefinitelyRequired(source: RequiredContainer): Set<string> {
  const ret = new Set([...(source.required ?? [])]);

  if (source.oneOf) {
    setExtend(ret, setIntersect(...source.oneOf.map(calculateDefinitelyRequired)));
  }
  if (source.anyOf) {
    setExtend(ret, setIntersect(...source.anyOf.map(calculateDefinitelyRequired)));
  }
  if (source.allOf) {
    setExtend(ret, ...source.allOf.map(calculateDefinitelyRequired));
  }

  return ret;
}

export function lastWord(x: string): string {
  return x.match(/([a-zA-Z0-9]+)$/)?.[1] ?? x;
}

export function collectionNameHint(nameHint: string) {
  return `${nameHint}Items`;
}

export function setIntersect<A>(...xs: Set<A>[]): Set<A> {
  if (xs.length === 0) {
    return new Set();
  }
  const ret = new Set(xs[0]);
  for (const x of xs) {
    for (const e of ret) {
      if (!x.has(e)) {
        ret.delete(e);
      }
    }
  }
  return ret;
}

export function setExtend<A>(ss: Set<A>, ...xs: Set<A>[]): void {
  for (const e of xs.flatMap((x) => Array.from(x))) {
    ss.add(e);
  }
}

export function removeUnionDuplicates(types: PropertyType[]) {
  if (types.length === 0) {
    throw new Error('Union cannot be empty');
  }

  for (let i = 0; i < types.length; ) {
    const type = new RichPropertyType(types[i]);

    let dupe = false;
    for (let j = i + 1; j < types.length; j++) {
      dupe ||= type.javascriptEquals(types[j]);
    }

    if (dupe) {
      types.splice(i, 1);
    } else {
      i += 1;
    }
  }

  if (types.length === 0) {
    throw new Error('Whoopsie, union ended up empty');
  }
}

export interface RequiredContainer {
  readonly required?: string[];
  readonly oneOf?: RequiredContainer[];
  readonly anyOf?: RequiredContainer[];
  readonly allOf?: RequiredContainer[];
}
