/**
 * Patches that apply to the CloudFormation Registry documents we have found in the wild.
 *
 * These find and remove handwritten JSON Schema schemas that don't make any sense.
 */
import canonicalize from 'canonicalize';
import { normalizeJsonSchema } from './json-schema-patches';
import {
  TypeKeyWitness,
  STRING_KEY_WITNESS,
  OBJECT_KEY_WITNESS,
  ARRAY_KEY_WITNESS,
  BOOLEAN_KEY_WITNESS,
  NUMBER_KEY_WITNESS,
  NULL_KEY_WITNESS,
  isRoot,
  JsonObjectLens,
  makeCompositePatcher,
  onlyObjects,
} from '../patching';

/**
 * Patchers that apply to the CloudFormation Registry source files
 */
export const patchCloudFormationRegistry = onlyObjects(
  makeCompositePatcher(
    normalizeJsonSchema,
    replaceArrayLengthProps,
    removeBooleanPatterns,
    canonicalizeDefaultOnBoolean,
    patchMinLengthOnInteger,
    canonicalizeRegexInFormat,
    markAsNonTaggable,
    incorrectTagPropertyFormat,
    noIncorrectDefaultType,
    removeSuspiciousPatterns,
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
    typeof lens.value.format === 'string' &&
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
 * All resources are taggable by default, but not all of them have the required 'Tags' property
 *
 * If nothing else is configured and the resource doesn't have the 'Tags' property, it should
 * have been marked as non-taggable.
 */
export function markAsNonTaggable(lens: JsonObjectLens) {
  if (!isRoot(lens)) {
    return;
  }

  if (lens.value.taggable !== undefined || lens.value.tagging !== undefined) {
    // User configured something, we trust them
    return;
  }

  const properties: Record<string, unknown> = (lens.value.properties as any) ?? {};
  if (!properties.Tags) {
    lens.addProperty('Resource does not have "Tags" property so should be marked non-taggable', 'taggable', false);
  }
}

/**
 * `tagProperty` must look like `/properties/Tags`. It may not look like `#/properties/Tags`.
 */
export function incorrectTagPropertyFormat(lens: JsonObjectLens) {
  if (
    lens.jsonPointer === '/tagging' &&
    typeof lens.value.tagProperty === 'string' &&
    lens.value.tagProperty.startsWith('#/')
  ) {
    lens.replaceProperty(
      'tagProperty should look like "/properties/Tags", not "#/properties/Tags"',
      'tagProperty',
      lens.value.tagProperty.substring(1),
    );
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

function typeOf(x: unknown) {
  if (Array.isArray(x)) {
    return 'array';
  }
  return typeof x;
}
