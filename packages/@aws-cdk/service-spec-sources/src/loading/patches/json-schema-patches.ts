/**
 * Patches that apply generically to all JSON Schema documents
 *
 * We simplify some JSON schema representations to make them easier to work with.
 */
import canonicalize from 'canonicalize';
import { retainRelevantKeywords, witnessForType } from './field-witnesses';
import { JsonLens, JsonObjectLens, NO_MISTAKE, isRoot } from './json-lens';
import { makeCompositePatcher, onlyObjects } from './patching';

/**
 * Normalize JSON schema data
 */
export const normalizeJsonSchema = onlyObjects(
  makeCompositePatcher(
    explodeTypeArray,
    missingTypeObject,
    normalizeMixedMapRecord,
    canonicalizeTypeOperators('oneOf'),
    canonicalizeTypeOperators('anyOf'),
    canonicalizeTypeOperators('allOf'),
    removeEmptyRequiredArray,
  ),
);

/**
 * If `type` is an array, either type is fine, and whatever keywords are on the type
 * that apply to any of the types in the array apply to that type.
 */
export function explodeTypeArray(lens: JsonObjectLens) {
  if (Array.isArray(lens.value.type)) {
    const oneOf = lens.value.type.map((v) => {
      return {
        ...retainRelevantKeywords(lens.value, witnessForType(v)),
        type: v,
      };
    });

    // Get a list of keys that were in the original but aren't in any of the more specific types
    const allKeys = new Set(Object.keys(lens.value));
    for (const usedKey of oneOf.flatMap((x) => Object.keys(x))) {
      allKeys.delete(usedKey);
    }

    for (const unusedKey of allKeys) {
      lens.removeProperty(`'${unusedKey}' not applicable to any of ${JSON.stringify(lens.value.type)}`, unusedKey);
    }

    lens.replaceValue(NO_MISTAKE, { oneOf });
  }
}

/**
 * Some type operators (oneOf/anyOf) are embedded in type objects.
 *
 * We lift them out to make the schema more regular to work with.
 *
 * Example:
 *
 * ```
 * {
 *   type: 'object',
 *   properties: { ... },
 *   oneOf: [
 *     { required: ['a'] },
 *     { required: ['b'] },
 *   ]
 * }
 * ```
 *
 * Turns into:
 *
 * ```
 * {
 *   oneOf: [
 *     { type: 'object', properties: { ... }, required: ['a'] },
 *     { type: 'object', properties: { ... }, required: ['b'] },
 *   ]
 * }
 * ```
 *
 */
export function canonicalizeTypeOperators(op: 'oneOf' | 'anyOf' | 'allOf') {
  return (lens: JsonObjectLens) => {
    // Only normalize 'oneOf' if we're not at the root. We make an exception for these.
    // Don't do anything if 'oneOf' appears in the position of a property name, that's valid without
    // invoking its special powers.
    if (isRoot(lens) || !isInSchemaPosition(lens)) {
      return;
    }

    const branches = lens.value[op];
    if (!Array.isArray(branches)) {
      return;
    }
    if (branches.length === 1) {
      const merged = deepMerge(branches[0], restOfObjectWithout(lens.value, [op]));
      return lens.replaceValue(NO_MISTAKE, merged);
    }

    const newBranches = deepDedupe(
      branches.map((branch) => {
        return deepMerge(branch, restOfObjectWithout(lens.value, [op]));
      }),
    );

    const replacement = { [op]: newBranches };
    // Prevent infinite recursion that would be a no-op
    if (!deepEqual(lens.value, replacement)) {
      lens.replaceValue(NO_MISTAKE, replacement);
    }
  };
}

/**
 * If it looks like we're trying to validate an object or a map but we forgot the 'type' keyword...
 *
 * (Not a mistake: JSON Schema just allows you to do that)
 */
export function missingTypeObject(lens: JsonObjectLens) {
  if (!isRoot(lens) && isInSchemaPosition(lens) && lens.value.type === undefined) {
    if (
      lens.value.properties !== undefined ||
      lens.value.additionalProperties !== undefined ||
      lens.value.patternProperties !== undefined
    ) {
      lens.addProperty(NO_MISTAKE, 'type', 'object');
    }
  }
}

/**
 * Some map objects have `required: []`. It's not wrong, but our types don't enjoy it, so remove 'em.
 */
export function removeEmptyRequiredArray(lens: JsonObjectLens) {
  if (lens.value.type === 'object' && Array.isArray(lens.value.required) && lens.value.required.length === 0) {
    lens.removeProperty(NO_MISTAKE, 'required');
  }
}

/**
 * Combine 'properties' and 'patternProperties' into just 'patternProperties'
 *
 * This is equivalent, and treats mixed record/map types as just map types
 * (with potentially stricter validation).
 *
 * Technically, a missing 'additionalProperties' counts as yes, but in practice
 * in the CloudFormation Registry Specification most users forgot to a put a `additionalProperties: false`
 * in. So we will only do this if the type is actually definitively marked
 * as `additionalProperties: true`.
 */
export function normalizeMixedMapRecord(lens: JsonObjectLens) {
  if (
    lens.value.type === 'object' &&
    typeof lens.value.properties === 'object' &&
    (typeof lens.value.patternProperties === 'object' || lens.value.additionalProperties)
  ) {
    const moveToPatternProps = Object.entries(lens.value.properties ?? {}).map(
      ([propName, propSchema]) => [escapeRe(propName), propSchema] as const,
    );
    lens.removeProperty(NO_MISTAKE, 'properties');

    // Move to pattern properties. Either mix into an object already there, or add a new object
    if (typeof lens.value.patternProperties === 'object') {
      const addlLens = lens.descendObjectField('patternProperties') as JsonObjectLens;
      for (const [name, schema] of moveToPatternProps) {
        addlLens.addProperty(NO_MISTAKE, name, schema);
      }
    } else {
      lens.addProperty(NO_MISTAKE, 'patternProperties', Object.fromEntries(moveToPatternProps));
    }
  }
}

/**
 * Whether the current object is in a position where a schema is expected
 *
 * This is usually true, UNLESS we're in the 'properties' array, in which case
 * all names are literal.
 */
export function isInSchemaPosition(lens: JsonLens) {
  return !lens.jsonPath.endsWith('/properties');
}

/**
 * Do a deep dedupe of the given objects
 */
function deepDedupe<A>(xs: A[]): A[] {
  const ret = new Array<A>();
  const seen = new Set<string>();
  for (const x of xs) {
    const json = canonicalize(x);
    if (!seen.has(json)) {
      ret.push(x);
      seen.add(json);
    }
  }
  return ret;
}

function deepMerge(x: any, y: any): any {
  const returnObj = JSON.parse(JSON.stringify(x));
  for (const [k, v] of Object.entries(y)) {
    if (Array.isArray(v) && Array.isArray(returnObj[k])) {
      returnObj[k].push(...v);
    } else if (typeof v === 'object' && typeof returnObj[k] === 'object') {
      deepMerge(returnObj[k], v);
    } else {
      returnObj[k] = v;
    }
  }
  return returnObj;
}

function deepEqual(x: any, y: any) {
  return canonicalize(x) === canonicalize(y);
}

function restOfObjectWithout(obj: any, values: string[]) {
  const returnObj = { ...obj };
  for (const val of values) {
    delete returnObj[val];
  }
  return returnObj;
}

function escapeRe(x: string) {
  return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}
