import canonicalize from 'canonicalize';
import { JsonLens } from '../../src/loading/patches/json-lens';
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
  removeMinMaxLengthOnObject,
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

      const { root: patchedObj } = applyPatcher(obj, replaceArrayLengthProps as Patcher<JsonLens>);

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

      const { root: patchedObj } = applyPatcher(obj, replaceArrayLengthProps as Patcher<JsonLens>);

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

      const { root: patchedObj } = applyPatcher(obj, removeBooleanPatterns as Patcher<JsonLens>);

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

      const { root: patchedObj } = applyPatcher(obj, explodeTypeArray as Patcher<JsonLens>);

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

      const { root: patchedObj } = applyPatcher(obj, explodeTypeArray as Patcher<JsonLens>);

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

      const { root: patchedObj } = applyPatcher(obj, canonicalizeTypeOperators('oneOf') as Patcher<JsonLens>);

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

      const { root: patchedObj } = applyPatcher(obj, canonicalizeTypeOperators('anyOf') as Patcher<JsonLens>);

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

      const { root: patchedObj } = applyPatcher(obj, canonicalizeTypeOperators('anyOf') as Patcher<JsonLens>);

      expect(patchedObj).toEqual(obj);
    });
  });

  describe(canonicalizeDefaultOnBoolean, () => {
    test('boolean stays the same', () => {
      const obj = {
        type: 'boolean',
        default: false,
      };

      const { root: patchedObj } = applyPatcher(obj, canonicalizeDefaultOnBoolean as Patcher<JsonLens>);

      expect(patchedObj).toEqual(obj);
    });

    test('string is canonicalized to boolean', () => {
      const obj = {
        type: 'boolean',
        default: 'true',
      };

      const { root: patchedObj } = applyPatcher(obj, canonicalizeDefaultOnBoolean as Patcher<JsonLens>);

      expect(canonicalize(patchedObj)).toEqual(
        canonicalize({
          type: 'boolean',
          default: true,
        }),
      );
    });
  });

  describe(patchMinLengthOnInteger, () => {
    test('base case', () => {});
  });

  describe(canonicalizeRegexInFormat, () => {
    test('base case', () => {});
  });

  describe(removeEmptyRequiredArray, () => {
    test('base case', () => {});
  });

  describe(noIncorrectDefaultType, () => {
    test('base case', () => {});
  });

  describe(removeMinMaxLengthOnObject, () => {
    test('base case', () => {});
  });

  describe(removeSuspiciousPatterns, () => {
    test('base case', () => {});
  });

  describe(missingTypeField, () => {
    test('base case', () => {});
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

      const { root: patchedObj } = applyPatcher(obj, dropRedundantTypeOperatorsInMetricStream as Patcher<JsonLens>);

      expect(patchedObj).toEqual({ typeName: 'AWS::CloudWatch::MetricStream' });
    });
  });

  describe(minMaxItemsOnObject, () => {
    test('base case', () => {});
  });

  describe(makeKeywordDropper, () => {
    test('base case', () => {});
  });
});
