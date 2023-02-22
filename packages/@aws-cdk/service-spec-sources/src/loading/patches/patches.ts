import canonicalize from 'canonicalize';
import {
  TypeKeyWitness,
  STRING_KEY_WITNESS,
  OBJECT_KEY_WITNESS,
  ARRAY_KEY_WITNESS,
  BOOLEAN_KEY_WITNESS,
  NUMBER_KEY_WITNESS,
  retainRelevantKeywords,
  NULL_KEY_WITNESS,
} from './field-witnesses';
import { JsonLens, JsonObjectLens, NO_MISTAKE } from './json-lens';
import { JsonPatch } from './json-patch';
import { PatchReport, SchemaLens } from './json-patcher';

type Patcher<L extends JsonLens> = (lens: L) => void;

function makeCompositePatcher<L extends JsonLens>(...patchers: Patcher<L>[]): Patcher<L> {
  return (lens) => {
    for (const patcher of patchers) {
      patcher(lens);
    }
  };
}

function onlyObjects(patcher: Patcher<JsonObjectLens>): Patcher<JsonLens> {
  return (lens) => {
    if (lens.isJsonObject()) {
      patcher(lens);
    }
  };
}

export const allPatchers = onlyObjects(
  makeCompositePatcher(
    removeAdditionalProperties,
    replaceArrayLengthProps,
    removeBooleanPatterns,
    explodeTypeArray,
    canonicalizeTypeOperators('oneOf'),
    canonicalizeTypeOperators('anyOf'),
    canonicalizeTypeOperators('allOf'),
    canonicalizeDefaultOnBoolean,
    patchMinLengthOnInteger,
    canonicalizeRegexInFormat,
    removeEmptyRequiredArray,
    noIncorrectDefaultType,
    removeMinMaxLengthOnObject,
    removeSuspiciousPatterns,
    missingTypeField,
    minMaxItemsOnObject,
    makeKeywordDropper('string', STRING_KEY_WITNESS),
    makeKeywordDropper('object', OBJECT_KEY_WITNESS),
    makeKeywordDropper('array', ARRAY_KEY_WITNESS),
    makeKeywordDropper('boolean', BOOLEAN_KEY_WITNESS),
    makeKeywordDropper('integer', NUMBER_KEY_WITNESS),
    makeKeywordDropper('number', NUMBER_KEY_WITNESS),
    makeKeywordDropper('null', NULL_KEY_WITNESS),
  ),
);

/**
 * The property 'additionalProperties' should only exist on object types.
 * This function removes any instances of 'additionalProperties' on non-objects.
 */
export function removeAdditionalProperties(lens: JsonObjectLens) {
  if (lens.value.type !== 'object' && lens.value.additionalProperties !== undefined) {
    lens.removeProperty('additionalProperties may only exist on object types', 'additionalProperties');
  }
}

/**
 * Arrays use 'minItems' and 'maxItems' to delineate boundaries.
 * Some specs erroneously use 'minLength' and 'maxLength'. This
 * function renames those values.
 */
export function replaceArrayLengthProps(lens: JsonObjectLens) {
  if (lens.value.type !== 'array') {
    return;
  }

  if (lens.value.minLength !== undefined) {
    lens.renameProperty('array lengths are specified using minItems, not minLength', 'minLength', 'minItems');
  }

  if (lens.value.maxLength !== undefined) {
    lens.renameProperty('array lengths are specified using maxItens, not maxLength', 'maxLength', 'maxItems');
  }
}

/**
 * Although allowed, including `pattern: 'true|false'` on boolean
 * properties is redundant. This function removes those instances.
 */
export function removeBooleanPatterns(lens: JsonObjectLens) {
  if (lens.value.type === 'boolean' && lens.value.pattern !== undefined) {
    lens.removeProperty('pattern is redundant on boolean property', 'pattern');
  }
}

/**
 * format: 'string' and pattern: 'string' are probably not intended.
 *
 * Do we really mean the literal text `s t r i n g` ?
 */
export function removeSuspiciousPatterns(lens: JsonObjectLens) {
  if (lens.value?.format === 'string') {
    lens.removeProperty('you probably did not mean the literal string "string"', 'format');
  }
  if (lens.value?.pattern === 'string') {
    lens.removeProperty('you probably did not mean the literal string "string"', 'pattern');
  }
}

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
    // Only normalize 'oneOf' if we're not at the root. We make an exception for these t
    // Don't do anything if 'oneOf' appears in the position of a property name, that's valid without
    // invoking its special powers.
    if (isRoot(lens) || !isInSchemaPosition(lens)) {
      return;
    }

    const branches = lens.value[op];
    if (!Array.isArray(branches)) {
      return;
    }

    const newBranches = deepDedupe(
      branches.map((branch) => {
        return {
          ...restOfObjectWithout(lens.value, [op]),
          ...branch,
        };
      }),
    );

    const replacement = { [op]: newBranches };
    // Prevent infinite recursion that would be a no-op
    if (!deepEqual(lens.value, replacement)) {
      lens.replaceValue(NO_MISTAKE, replacement);
    }

    // Let's not try to be too clever for now
    /*
    switch (newBranches.length) {
      case 0:
        lens.removeProperty(`empty ${op}`, op);
        break;
      case 1:
        lens.replaceProperty(`unnecessary ${op}`, op, newBranches[0]);
        break;
      default:
        const replacement = { [op]: newBranches };
        if (!deepEqual(lens.value, replacement)) {
          lens.replaceValue(NO_MISTAKE, replacement);
        }
        break;
    }
    */
  };
}

export function erroneousInsertionOrderOnObject(lens: JsonObjectLens) {
  if (lens.value.type === 'object') {
    if (lens.value.insertionOrder !== undefined) {
      lens.removeProperty('object does not have insertionOrder prop', 'insertionOrder');
    }
  }
}

export function patchMinLengthOnInteger(lens: JsonObjectLens) {
  if ((lens.value.type === 'integer' || lens.value.type === 'number') && lens.value.minLength !== undefined) {
    lens.removeProperty('integers do not have minLength', 'minLength');
  }
}

export function canonicalizeDefaultOnBoolean(lens: JsonObjectLens) {
  if (lens.value.type === 'boolean' && typeof lens.value.default === 'string') {
    lens.renameProperty('canonicalize default type', 'default', 'default', (d) => d === 'true');
  }
}

export function canonicalizeRegexInFormat(lens: JsonObjectLens) {
  if (
    lens.value.type === 'string' &&
    lens.value.format !== undefined &&
    lens.value.pattern === undefined &&
    typeof lens.value.format === 'string'
  ) {
    if (!['uri', 'timestamp', 'date-time'].includes(lens.value.format)) {
      lens.replaceProperty('canonicalize regexes in format', 'pattern', lens.value.format);
    }
  }
}

/**
 * Some map objects have `required: []`. It's not wrong, but our types don't enjoy it, so remove 'em.
 */
export function removeEmptyRequiredArray(lens: JsonObjectLens) {
  if (lens.value.type === 'object' && Array.isArray(lens.value.required) && lens.value.required.length === 0) {
    lens.removeProperty('no-mistake', 'required');
  }
}

/**
 * We're seeing `type: string` with `default: <boolean>`.
 */
export function noIncorrectDefaultType(lens: JsonObjectLens) {
  if (
    typeof lens.value.type === 'string' &&
    lens.value.default !== undefined &&
    typeof lens.value.default !== lens.value.type
  ) {
    lens.removeProperty(`default value for a ${lens.value.type} cannot be a ${typeof lens.value.default}`, 'default');
  }
}

/**
 * We're seeing `type: object` with `minLength/maxLength`.
 *
 * I think people intend for this to represent the maximum string length of
 * the JSONification of this object, but it's not valid JSON Schema.
 */
export function removeMinMaxLengthOnObject(lens: JsonObjectLens) {
  if (lens.value.type === 'object') {
    if (lens.value.minLength) {
      lens.removeProperty('minLength does not make sense on an object type', 'minLength');
    }
    if (lens.value.maxLength) {
      lens.removeProperty('maxLength does not make sense on an object type', 'maxLength');
    }
  }
}

/**
 * We're seeing `type: object` with `minItems/maxItems`.
 *
 * I think people intend for this to represent the amount of elements in a map.
 */
export function minMaxItemsOnObject(lens: JsonObjectLens) {
  if (lens.value.type === 'object') {
    if (lens.value.additionalProperties || lens.value.patternProperties) {
      if (lens.value.minItems !== undefined) {
        lens.renameProperty('should use minProperties on an object type', 'minItems', 'minProperties');
      }
      if (lens.value.maxItems !== undefined) {
        lens.renameProperty('should use maxProperties on an ojbect type', 'maxItems', 'maxProperties');
      }
    } else {
      if (lens.value.minItems !== undefined) {
        lens.removeProperty('minItems/minProperties does not make sense on fixed size object', 'minItems');
      }
      if (lens.value.maxItems !== undefined) {
        lens.removeProperty('maxItems/maxProperties does not make sense on fixed size object', 'maxItems');
      }
    }
  }
}

/**
 * If it looks like we're trying to validate an object or a map but we forgot the 'type' keyword...
 */
export function missingTypeField(lens: JsonObjectLens) {
  if (!isRoot(lens) && isInSchemaPosition(lens) && lens.value.type === undefined) {
    if (
      lens.value.properties !== undefined ||
      lens.value.additionalProperties !== undefined ||
      lens.value.patternProperties !== undefined
    ) {
      lens.addProperty('forgot type: object', 'type', 'object');
    }
  }
}

export function recurseAndPatch(root: any, patcher: Patcher<JsonLens>) {
  // Do multiple iterations to find a fixpoint for the patching
  const patchSets = new Array<PatchReport[]>();
  let maxIterations = 10;
  while (maxIterations) {
    const schema = new SchemaLens(root, { fileName: '' });
    recurse(schema);
    if (!schema.hasPatches) {
      break;
    }
    patchSets.push(schema.reports);

    if (--maxIterations === 0) {
      throw new Error(
        [
          'Patching JSON failed to stabilize. Infinite recursion? Most recent patchsets:',
          JSON.stringify(patchSets.slice(-2), undefined, 2),
        ].join('\n'),
      );
    }
    try {
      root = applyPatches(schema.patches);
    } catch (e) {
      // We may have produced patches that no longer cleanly apply depending on what other patches have done.
      // Catch those occurrences and give it another go on the next round.
    }
  }
  return root;

  function recurse(lens: SchemaLens) {
    patcher(lens);

    if (Array.isArray(lens.value)) {
      lens.value.forEach((_, i) => {
        recurse(lens.descendArrayElement(i));
      });
    }

    if (lens.isJsonObject()) {
      for (const k of Object.keys(lens.value)) {
        if (!lens.wasRemoved(k)) {
          recurse(lens.descendObjectField(k));
        }
      }
    }
  }

  function applyPatches(patches: JsonPatch[]) {
    return JsonPatch.apply(root, ...patches);
  }
}

function restOfObjectWithout(obj: any, values: string[]) {
  const returnObj = { ...obj };
  for (const val of values) {
    delete returnObj[val];
  }
  return returnObj;
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

function deepEqual(x: any, y: any) {
  return canonicalize(x) === canonicalize(y);
}

/**
 * Whether the current object is in a position where a schema is expected
 *
 * This is usually true, UNLESS we're in the 'properties' array, in which case
 * all names are literal.
 */
function isInSchemaPosition(lens: JsonLens) {
  return !lens.jsonPath.endsWith('/properties');
}

function isRoot(lens: JsonLens) {
  return lens.rootPath.length === 1;
}

/**
 * Drop keywords that aren't in a field witness
 *
 * Ignore allOf/anyOf etc, those will be normalized out later.
 */
function dropIrrelevantKeywords(lens: JsonObjectLens, typeDescription: string, witness: TypeKeyWitness<any>) {
  // The root is special
  if (isRoot(lens)) {
    return;
  }

  const protectedKeys = ['anyOf', 'oneOf', 'allOf'];

  for (const key of Object.keys(lens.value)) {
    if (!witness[key] && !protectedKeys.includes(key)) {
      lens.removeProperty(`${key} does not apply to ${typeDescription}`, key);
    }
  }
}

function makeKeywordDropper(typeName: string, witness: TypeKeyWitness<any>) {
  return (lens: JsonObjectLens) => {
    if (lens.value.type === typeName) {
      dropIrrelevantKeywords(lens, `type=${typeName}`, witness);
    }
  };
}

function witnessForType(type: string): TypeKeyWitness<any> {
  switch (type) {
    case 'string':
      return STRING_KEY_WITNESS;
    case 'object':
      return OBJECT_KEY_WITNESS;
    case 'boolean':
      return BOOLEAN_KEY_WITNESS;
    case 'number':
    case 'integer':
      return NUMBER_KEY_WITNESS;
    case 'array':
      return ARRAY_KEY_WITNESS;
    case 'null':
      return NULL_KEY_WITNESS;

    default:
      throw new Error(`Don't recognize type: ${type}`);
  }
}