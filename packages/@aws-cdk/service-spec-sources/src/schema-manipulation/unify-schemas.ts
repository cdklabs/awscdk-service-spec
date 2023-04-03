import { failure, isFailure, isSuccess, liftResult, locateFailure, Result, using } from '@cdklabs/tskb';
import { jsonschema } from '../types';

/**
 * Unify an arbitrary number of schemas
 *
 * Do this by doing pairwise unification.
 */
export function unionSchemas(...xs: jsonschema.Schema[]): Result<jsonschema.Schema> {
  if (xs.length === 0) {
    return failure('unionSchemas: empty array');
  }
  return simplifyUnion({ anyOf: xs });
}

/**
 * Merge two schemas, returning a new schema that will satisfy both input schemas
 *
 * This operation will only work if both inputs have the same `type`.
 *
 * But if they have validations like `minLength` or `maxLength`, the largest possible
 * values will be returned.
 *
 * If the types are object types, the required properties will be intersected.
 *
 * Will not unify "through" references. If referenced types are not the same, unification will fail.
 */
function simplifyPair(
  a: jsonschema.SingletonSchema,
  b: jsonschema.SingletonSchema,
): Result<jsonschema.SingletonSchema> {
  // A little shortcut that will save us a bunch of recursion
  if (a === b) {
    return a;
  }

  if (jsonschema.isAnyType(a) || jsonschema.isAnyType(b)) {
    return true;
  }

  if (jsonschema.isReference(a) || jsonschema.isReference(b)) {
    return jsonschema.isReference(a) && jsonschema.isReference(b) && a.$ref === b.$ref
      ? a
      : failure(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  }

  const meta = {
    $comment: first(a.$comment, b.$comment),
    description: first(a.description, b.description),
  };

  switch (a.type) {
    case 'string':
      if (b.type !== 'string') {
        return failure(`${a.type} != ${b.type}`);
      }

      return {
        type: 'string',
        ...meta,
        enum: combine(a.enum, b.enum, (aenum, benum) => Array.from(new Set([...aenum, ...benum]))),
        default: ifEqual(a.default, b.default),
        format: ifEqual(a.format, b.format),
        minLength: combine(a.minLength, b.minLength, (x, y) => Math.min(x, y)),
        maxLength: combine(a.maxLength, b.maxLength, (x, y) => Math.max(x, y)),
        pattern: combine(a.pattern, b.pattern, (x, y) => `${x}|${y}`),
      };

    case 'array':
      if (b.type !== 'array') {
        return failure(`${a.type} != ${b.type}`);
      }

      return using(locateFailure('array.items')(unionSchemas(a.items ?? true, b.items ?? true)), (items) => ({
        type: 'array',
        ...meta,
        items,
        minLength: combine(a.minItems, b.minItems, (x, y) => Math.min(x, y)),
        maxLength: combine(a.maxItems, b.maxItems, (x, y) => Math.max(x, y)),
        uniqueItems: combine(a.uniqueItems, b.uniqueItems, (x, y) => x && y),
        // FIXME: insertionOrder ??
      }));

    case 'boolean':
      if (b.type !== 'boolean') {
        return failure(`${a.type} != ${b.type}`);
      }

      return {
        type: 'boolean',
        ...meta,
      };

    case 'integer':
    case 'number':
      if (b.type !== 'integer' && b.type !== 'number') {
        return failure(`${a.type} != ${b.type}`);
      }

      return {
        type: a.type === 'integer' && b.type === 'integer' ? 'integer' : 'number',
        ...meta,
        enum: combine(a.enum, b.enum, (aenum, benum) => Array.from(new Set([...aenum, ...benum]))),
        minimum: combine(a.minimum, b.minimum, (x, y) => Math.min(x, y)),
        maximum: combine(a.maximum, b.maximum, (x, y) => Math.max(x, y)),
      };

    case 'object':
      if (b.type !== 'object') {
        return failure(`${a.type} != ${b.type}`);
      }

      if (jsonschema.isRecordLikeObject(a) && jsonschema.isRecordLikeObject(b)) {
        return unifyRecordTypes(meta, a, b);
      }
      if (jsonschema.isMapLikeObject(a) && jsonschema.isMapLikeObject(b)) {
        return unifyMapTypes(meta, a, b);
      }

      return failure(
        `record type: ${jsonschema.isRecordLikeObject(a)} != record type: ${jsonschema.isRecordLikeObject(b)}`,
      );

    case 'null':
      // Optionality will be recorded somewhere else
      return b;
  }
}

/**
 * Simplify a union type as much as possible
 */
function simplifyUnion(x: jsonschema.UnionSchema<jsonschema.Schema>): jsonschema.Schema {
  // Expand inner unions
  const schemas = jsonschema
    .innerSchemas(x)
    .flatMap((y) => (jsonschema.isUnionSchema(y) ? jsonschema.innerSchemas(y) : [y]));
  for (let i = 0; i < schemas.length; ) {
    const lhs = schemas[i];
    if (isSingleton(lhs)) {
      const target = firstThat(schemas, i + 1, (other) =>
        isSingleton(other) ? simplifyPair(lhs, other) : failure(''),
      );

      if (isSuccess(target)) {
        // Replace 'i' with the unified type, remove 'j' (i < j)
        const [combination, j] = target;
        schemas.splice(j, 1);
        schemas.splice(i, 1, combination);
        continue;
      }
    }

    i += 1;
  }

  return schemas.length === 1 ? schemas[0] : { anyOf: schemas };
}

/**
 * Return the result and the index of the first success result returned by a function
 */
function firstThat<A, B>(xs: A[], start: number, fn: (x: A) => Result<B>): Result<[B, number]> {
  for (let i = start; i < xs.length; i++) {
    const r = fn(xs[i]);
    if (isSuccess(r)) {
      return [r, i];
    }
  }
  return failure('Nothing matched');
}

function unifyRecordTypes(
  meta: any,
  a: jsonschema.RecordLikeObject,
  b: jsonschema.RecordLikeObject,
): Result<jsonschema.RecordLikeObject> {
  // Most difficult decisions are here -- what do we do with mismatching properties?
  // Fail unification or just fail the single property?

  const keys = union(Object.keys(a.properties), Object.keys(b.properties));
  const properties = locateFailure('object.properties')(
    liftResult(
      Object.fromEntries(
        keys.map((key) => [key, locateFailure(`[${key}]`)(unionSchemas(a.properties[key], b.properties[key]))]),
      ),
    ),
  );

  if (isFailure(properties)) {
    return properties;
  }

  return {
    type: 'object',
    ...meta,
    properties: properties,
    required: intersect(a.required ?? [], b.required ?? []),
  };
}

function unifyMapTypes(
  meta: any,
  a: jsonschema.MapLikeObject,
  b: jsonschema.MapLikeObject,
): Result<jsonschema.MapLikeObject> {
  const aPats = { ...a.patternProperties };
  const aAddl = a.additionalProperties ?? true;
  const bPats = { ...b.patternProperties };
  const bAddl = b.additionalProperties ?? true;

  const additionalProperties = aAddl && bAddl ? unionSchemas(aAddl, bAddl) : aAddl ? aAddl : bAddl;
  if (isFailure(additionalProperties)) {
    return locateFailure('additionalProperties')(additionalProperties);
  }

  for (const key in bPats) {
    if (aPats[key]) {
      const pat = unionSchemas(aPats[key], bPats[key]);
      if (isFailure(pat)) {
        return locateFailure(key)(pat);
      }
      aPats[key] = pat;
    } else {
      aPats[key] = bPats[key];
    }
  }

  return {
    type: 'object',
    ...meta,
    additionalProperties,
    patternProperties: aPats,
  };
}

function first<A>(x: A | undefined, y: A | undefined) {
  return x !== undefined ? x : y;
}

function combine<A>(x: A | undefined, y: A | undefined, cb: (x: A, y: A) => A) {
  return x !== undefined && y !== undefined ? cb(x, y) : undefined;
}

function ifEqual<A>(x: A | undefined, y: A | undefined) {
  return x === y ? x : undefined;
}

function union<A>(xs: Iterable<A>, ys: Iterable<A>): A[] {
  return Array.from(new Set([...xs, ...ys]));
}

function intersect<A>(xs: A[], ys: A[]): A[] {
  const xss = new Set(xs);
  return ys.filter((y) => xss.has(y));
}

function isSingleton(x: jsonschema.Schema): x is jsonschema.SingletonSchema {
  return !jsonschema.isOneOf(x) && !jsonschema.isAnyOf(x) && !jsonschema.isAllOf(x);
}
