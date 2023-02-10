import { failure, isFailure, liftResult, locateFailure, Result, using } from '@cdklabs/tskb';
import { jsonschema } from '../types/JsonSchema';

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
export function unifySchemas(a: jsonschema.Schema, b: jsonschema.Schema): Result<jsonschema.Schema> {
  // A little shortcut that will save us a bunch of recursion
  if (a === b) {
    return a;
  }

  if (jsonschema.isReference(a) || jsonschema.isReference(b)) {
    return jsonschema.isReference(a) && jsonschema.isReference(b) && a.$ref === b.$ref ? a : failure(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
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

      return using(
        locateFailure('array.items')(unifySchemas(a.items, b.items)),
        items => ({
          type: 'array',
          ...meta,
          items,
          minLength: combine(a.minLength, b.minLength, (x, y) => Math.min(x, y)),
          maxLength: combine(a.maxLength, b.maxLength, (x, y) => Math.max(x, y)),
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

      const aIsRecord = jsonschema.isRecordLikeObject(a);
      const bIsRecord = jsonschema.isRecordLikeObject(b);
      if (aIsRecord !== bIsRecord) {
        return failure(`record type: ${aIsRecord} != record type: ${bIsRecord}`);
      }

      if (aIsRecord && bIsRecord) {
        return unifyRecordTypes(meta, a, b);
      }
      return unifyMapTypes(meta, a, b);
  };
}

/**
 * Unify an arbitrary number of schemas
 *
 * Do this by doing pairwise unification.
 */
export function unifyAllSchemas(xs: jsonschema.Schema[]): Result<jsonschema.Schema> {
  if (xs.length === 0) {
    return failure('unifyAllSchemas: empty array');
  }

  const schemas = [...xs];
  while (schemas.length > 1) {
    const uni = unifySchemas(schemas[0], schemas[1]);
    if (isFailure(uni)) { return uni; }
    schemas.splice(0, 2, uni);
  }
  return schemas[0];
}

function unifyRecordTypes(meta: any, a: jsonschema.RecordLikeObject, b: jsonschema.RecordLikeObject): Result<jsonschema.RecordLikeObject> {
  // Most difficult decisions are here -- what do we do with mismatching properties?
  // Fail unification or just fail the single property?

  const keys = union(Object.keys(a.properties), Object.keys(b.properties));
  const properties = locateFailure('object.properties')
  (liftResult(Object.fromEntries(keys.map(key =>
    [key, locateFailure(`[${key}]`)
    (unifySchemas(a.properties[key], b.properties[key]))]))));

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

function unifyMapTypes(meta: any, a: jsonschema.MapLikeObject, b: jsonschema.MapLikeObject): Result<jsonschema.MapLikeObject> {
  // Most difficult decisions are here
  const aPats = { ...a.patternProperties };
  const bPats = { ...b.patternProperties };

  if (a.additionalProperties || b.additionalProperties) {
    const unified = unifyAllSchemas([
      ...a.additionalProperties ? [a.additionalProperties] : [],
      ...b.additionalProperties ? [b.additionalProperties] : [],
      ...Object.values(aPats),
      ...Object.values(bPats),
    ]);
    if (isFailure(unified)) {
      return locateFailure('map type')(unified);
    }
    return {
      type: 'object',
      ...meta,
      additionalProperties: unified,
    };
  }

  for (const key in bPats) {
    if (aPats[key]) {
      const pat = unifySchemas(aPats[key], bPats[key]);
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
  return ys.filter(y => xss.has(y));
}