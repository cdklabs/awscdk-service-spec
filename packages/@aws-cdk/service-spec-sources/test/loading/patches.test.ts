import { JsonLens, JsonObjectLens } from '../../src/loading/patches/json-lens';
import { applyPatcher, Patcher } from '../../src/loading/patches/patching';
import {
  canonicalizeDefaultOnBoolean,
  canonicalizeRegexInFormat,
  canonicalizeTypeOperators,
  dropRedundantTypeOperatorsInMetricStream,
  explodeTypeArray,
  makeKeywordDropper,
  minMaxItemsOnObject,
  missingTypeField,
  noIncorrectDefaultType,
  patchMinLengthOnInteger,
  removeBooleanPatterns,
  removeEmptyRequiredArray,
  removeSuspiciousPatterns,
  replaceArrayLengthProps,
} from '../../src/loading/patches/registry-patches';

describe('patches', () => {
  describe(replaceArrayLengthProps, () => {
    test('works in the base case', () => {
      const obj = {
        type: 'array',
        minLength: 1,
        maxLength: 2,
      };

      const patchedObj = patchObject(obj, replaceArrayLengthProps);

      expect(patchedObj).toEqual({
        type: 'array',
        minItems: 1,
        maxItems: 2,
      });
    });

    test('works in embedded object', () => {
      const obj = {
        type: 'object',
        properties: {
          Prop: {
            type: 'array',
            minLength: 1,
            maxLength: 2,
          },
        },
      };

      const patchedObj = patchObject(obj, replaceArrayLengthProps);

      expect(patchedObj).toEqual({
        type: 'object',
        properties: {
          Prop: {
            type: 'array',
            minItems: 1,
            maxItems: 2,
          },
        },
      });
    });
  });

  describe(removeBooleanPatterns, () => {
    test('works in the base case', () => {
      const obj = {
        type: 'boolean',
        pattern: 'true|false',
      };

      const patchedObj = patchObject(obj, removeBooleanPatterns);

      expect(patchedObj).toEqual({
        type: 'boolean',
      });
    });
  });

  describe(explodeTypeArray, () => {
    test('works in the base case', () => {
      const obj = {
        type: ['string', 'object'],
      };

      const patchedObj = patchObject(obj, explodeTypeArray);

      expect(patchedObj).toEqual({
        oneOf: [
          {
            type: 'string',
          },
          {
            type: 'object',
          },
        ],
      });
    });

    test('works when object has other properties', () => {
      const obj = {
        type: ['string', 'object'],
        additionalProperties: false,
        minLength: 0,
      };

      const patchedObj = patchObject(obj, explodeTypeArray);

      expect(patchedObj).toEqual({
        oneOf: [
          {
            type: 'string',
            minLength: 0,
          },
          {
            type: 'object',
            additionalProperties: false,
          },
        ],
      });
    });
  });

  describe(canonicalizeTypeOperators, () => {
    test('type operator is expanded to include all community properties - oneOf', () => {
      const obj = {
        properties: {
          Prop: {
            description: 'my description',
            type: 'object',
            properties: {
              Name: {
                type: 'string',
              },
              Attribute: {
                type: 'string',
              },
              RequiredAttribute: {
                type: 'string',
              },
            },
            required: ['RequiredAttribute'],
            oneOf: [
              {
                required: ['Name'],
              },
              {
                required: ['Attribute'],
              },
            ],
          },
        },
      };

      const patchedObj = patchObject(obj, canonicalizeTypeOperators('oneOf'));

      expect(patchedObj).toEqual({
        properties: {
          Prop: {
            oneOf: [
              {
                description: 'my description',
                type: 'object',
                properties: {
                  Name: {
                    type: 'string',
                  },
                  Attribute: {
                    type: 'string',
                  },
                  RequiredAttribute: {
                    type: 'string',
                  },
                },
                required: ['Name', 'RequiredAttribute'],
              },
              {
                description: 'my description',
                type: 'object',
                properties: {
                  Name: {
                    type: 'string',
                  },
                  Attribute: {
                    type: 'string',
                  },
                  RequiredAttribute: {
                    type: 'string',
                  },
                },
                required: ['Attribute', 'RequiredAttribute'],
              },
            ],
          },
        },
      });
    });

    test('type operator expanded to include all community properties - anyOf', () => {
      const obj = {
        properties: {
          CreationDate: {
            description: 'my description',
            type: 'string',
            anyOf: [
              {
                format: 'date-time',
              },
              {
                format: 'timestamp',
              },
            ],
          },
        },
      };

      const patchedObj = patchObject(obj, canonicalizeTypeOperators('anyOf'));

      expect(patchedObj).toEqual({
        properties: {
          CreationDate: {
            anyOf: [
              {
                description: 'my description',
                type: 'string',
                format: 'date-time',
              },
              {
                description: 'my description',
                type: 'string',
                format: 'timestamp',
              },
            ],
          },
        },
      });
    });

    test('type operators are unchanged when in canonical format', () => {
      const obj = {
        properties: {
          CreationDate: {
            anyOf: [
              {
                description: 'my description',
                type: 'string',
                format: 'date-time',
              },
              {
                description: 'my description',
                type: 'string',
                format: 'timestamp',
              },
            ],
          },
        },
      };

      const patchedObj = patchObject(obj, canonicalizeTypeOperators('anyOf'));

      expect(patchedObj).toEqual(obj);
    });
  });

  describe(canonicalizeDefaultOnBoolean, () => {
    test('boolean stays the same', () => {
      const obj = {
        type: 'boolean',
        default: false,
      };

      const patchedObj = patchObject(obj, canonicalizeDefaultOnBoolean);

      expect(patchedObj).toEqual(obj);
    });

    test('string is canonicalized to boolean', () => {
      const obj = {
        type: 'boolean',
        default: 'true',
      };

      const patchedObj = patchObject(obj, canonicalizeDefaultOnBoolean);

      expect(patchedObj).toEqual({
        type: 'boolean',
        default: true,
      });
    });
  });

  describe(patchMinLengthOnInteger, () => {
    test('removes minlength on integer', () => {
      const obj = {
        type: 'integer',
        minLength: 5,
      };

      const patchedObj = patchObject(obj, patchMinLengthOnInteger);

      expect(patchedObj).toEqual({ type: 'integer' });
    });

    test('removes minlength on number', () => {
      const obj = {
        type: 'number',
        minLength: 5,
      };

      const patchedObj = patchObject(obj, patchMinLengthOnInteger);

      expect(patchedObj).toEqual({ type: 'number' });
    });
  });

  describe(canonicalizeRegexInFormat, () => {
    test('regexes in format become patterns', () => {
      const obj = {
        type: 'string',
        format: 'regex',
      };

      const patchedObj = patchObject(obj, canonicalizeRegexInFormat);

      expect(patchedObj).toEqual({
        type: 'string',
        pattern: 'regex',
      });
    });
  });

  describe(removeEmptyRequiredArray, () => {
    test('removes empty required', () => {
      const obj = {
        type: 'object',
        required: [],
      };

      const patchedObj = patchObject(obj, removeEmptyRequiredArray);

      expect(patchedObj).toEqual({ type: 'object' });
    });
  });

  describe(noIncorrectDefaultType, () => {
    test('removes incorrect default types', () => {
      const obj = {
        type: 'string',
        default: true,
      };

      const patchedObj = patchObject(obj, noIncorrectDefaultType);

      expect(patchedObj).toEqual({ type: 'string' });
    });
  });

  describe(removeSuspiciousPatterns, () => {
    test('remove format literal string', () => {
      const obj = {
        type: 'string',
        format: 'string',
      };

      const patchedObj = patchObject(obj, removeSuspiciousPatterns);

      expect(patchedObj).toEqual({ type: 'string' });
    });

    test('remove pattern literal string', () => {
      const obj = {
        type: 'string',
        pattern: 'string',
      };

      const patchedObj = patchObject(obj, removeSuspiciousPatterns);

      expect(patchedObj).toEqual({ type: 'string' });
    });
  });

  describe(missingTypeField, () => {
    test('if properties are defined without type, add type object', () => {
      const obj = {
        root: {
          properties: {
            Prop: {
              val: 'val',
            },
          },
        },
      };

      const patchedObj = patchObject(obj, missingTypeField);

      expect(patchedObj).toEqual({
        root: {
          type: 'object',
          properties: {
            Prop: {
              val: 'val',
            },
          },
        },
      });
    });
  });

  describe(dropRedundantTypeOperatorsInMetricStream, () => {
    test('removes the specific type operator in metric stream', () => {
      const obj = {
        typeName: 'AWS::CloudWatch::MetricStream',
        anyOf: [
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
        ],
      };

      const patchedObj = patchObject(obj, dropRedundantTypeOperatorsInMetricStream);

      expect(patchedObj).toEqual({ typeName: 'AWS::CloudWatch::MetricStream' });
    });
  });

  describe(minMaxItemsOnObject, () => {
    test('removed on properties', () => {
      const obj = {
        type: 'object',
        properties: {
          Prop: {
            val: 'val',
          },
        },
        minItems: 1,
        maxItems: 1,
      };

      const patchedObj = patchObject(obj, minMaxItemsOnObject);

      expect(patchedObj).toEqual({
        type: 'object',
        properties: {
          Prop: {
            val: 'val',
          },
        },
      });
    });

    test('replaced with min/maxProperties on additionalProperties', () => {
      const obj = {
        type: 'object',
        properties: {
          Prop: {
            val: 'val',
          },
        },
        additionalProperties: {
          AnotherProp: {
            val: 'val',
          },
        },
        minItems: 1,
        maxItems: 1,
      };

      const patchedObj = patchObject(obj, minMaxItemsOnObject);

      expect(patchedObj).toEqual({
        type: 'object',
        properties: {
          Prop: {
            val: 'val',
          },
        },
        additionalProperties: {
          AnotherProp: {
            val: 'val',
          },
        },
        minProperties: 1,
        maxProperties: 1,
      });
    });
  });

  describe(makeKeywordDropper, () => {
    test('strings', () => {
      const obj = {
        root: {
          type: 'string',
          weirdThing: 'blah',
          description: 'this is allowed',
        },
      };

      const patchedObj = patchObject(obj, makeKeywordDropper());

      expect(patchedObj).toEqual({
        root: {
          type: 'string',
          description: 'this is allowed',
        },
      });
    });
  });
});

function patchObject(obj: any, fn: Patcher<JsonObjectLens>): any {
  const { root: patchedObj } = applyPatcher(obj, fn as Patcher<JsonLens>);
  return patchedObj;
}
