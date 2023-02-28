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
import { makeCompositePatcher, onlyObjects } from './patching';

/**
 * Patchers that apply to the CloudFormation Registry source files
 */
export const patchCloudFormationRegistry = onlyObjects(
  makeCompositePatcher(
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
    removeSuspiciousPatterns,
    missingTypeField,
    dropRedundantTypeOperatorsInMetricStream,
    minMaxItemsOnObject,
    makeKeywordDropper(),
  ),
);

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
    lens.renameProperty('array lengths are specified using maxItems, not maxLength', 'maxLength', 'maxItems');
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

export function dropRedundantTypeOperatorsInMetricStream(lens: JsonObjectLens) {
  if (
    isRoot(lens) &&
    lens.value.typeName === 'AWS::CloudWatch::MetricStream' &&
    canonicalize(lens.value.anyOf) ===
      canonicalize([
        {
          required: ['FirehoseArn', 'RoleArn', 'OutputFormat'],
        },
        {
          allOf: [
            {
              required: ['FirehoseArn', 'RoleArn', 'OutputFormat'],
            },
          ],
        },
        {
          oneOf: [
            {
              required: ['IncludeFilters'],
            },
            {
              required: ['ExcludeFilters'],
            },
          ],
        },
      ])
  ) {
    lens.removeProperty(
      'AWS::CloudWatch::MetricStream has redundant anyOf that cannot be interpreted as a valid type operator',
      'anyOf',
    );
  }
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
  if (lens.value.type === 'boolean' && typeOf(lens.value.default) === 'string') {
    lens.renameProperty('canonicalize default type', 'default', 'default', (d) => d === 'true');
  }
}

export function canonicalizeRegexInFormat(lens: JsonObjectLens) {
  if (
    lens.value.type === 'string' &&
    lens.value.format !== undefined &&
    lens.value.format === 'string' &&
    !['uri', 'timestamp', 'date-time'].includes(lens.value.format)
  ) {
    // Format as a regex, store it in 'pattern' instead

    if (lens.value.pattern === undefined) {
      lens.renameProperty('prefer regexes in pattern', 'format', 'pattern');
    } else {
      lens.removeProperty('redundant regex in format', 'format');
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
  if (typeof lens.value.type === 'string' && lens.value.default !== undefined) {
    const defaultType = typeOf(lens.value.default);

    const numberTypes = ['integer', 'number'];
    if (numberTypes.includes(lens.value.type) && numberTypes.includes(defaultType)) {
      // These are equivalent
      return;
    }

    if (defaultType !== lens.value.type) {
      lens.removeProperty(
        `default value for type='${lens.value.type}' cannot be '${typeOf(lens.value.default)}'`,
        'default',
      );
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

export function makeKeywordDropper() {
  const witnesses: Record<string, TypeKeyWitness<any>> = {
    string: STRING_KEY_WITNESS,
    object: OBJECT_KEY_WITNESS,
    array: ARRAY_KEY_WITNESS,
    boolean: BOOLEAN_KEY_WITNESS,
    integer: NUMBER_KEY_WITNESS,
    number: NUMBER_KEY_WITNESS,
    null: NULL_KEY_WITNESS,
  };

  return (lens: JsonObjectLens) => {
    if (Array.isArray(lens.value.type)) {
      dropIrrelevantKeywords(
        lens,
        `any of type: '${lens.value.type}'`,
        Object.assign({}, ...lens.value.type.map(witness)),
      );
    } else if (typeof lens.value.type === 'string') {
      dropIrrelevantKeywords(lens, `type: '${lens.value.type}'`, witness(lens.value.type));
    }
  };

  function witness(x: string) {
    if (!witnesses[x]) {
      throw new Error(`Don't have witness for type: ${x}`);
    }
    return witnesses[x];
  }
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

  const protectedKeys = ['anyOf', 'oneOf', 'allOf', '$ref'];

  for (const key of Object.keys(lens.value)) {
    if (!witness[key] && !protectedKeys.includes(key)) {
      lens.removeProperty(`${key} does not apply to ${typeDescription}`, key);
    }
  }
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

function typeOf(x: unknown) {
  if (Array.isArray(x)) {
    return 'array';
  }
  return typeof x;
}
