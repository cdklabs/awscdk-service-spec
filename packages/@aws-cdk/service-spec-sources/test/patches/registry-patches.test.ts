import {
  canonicalizeDefaultOnBoolean,
  canonicalizeRegexInFormat,
  dropRedundantTypeOperatorsInMetricStream,
  makeKeywordDropper,
  minMaxItemsOnObject,
  noIncorrectDefaultType,
  patchCloudFormationRegistry,
  patchMinLengthOnInteger,
  removeBooleanPatterns,
  removeSuspiciousPatterns,
  replaceArrayLengthProps,
} from '../../src/patches/registry-patches';
import { applyPatcher, Patcher, JsonLens, JsonObjectLens } from '../../src/patching';
import { patchObject } from '../utils';

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

test('simplify unnecessary oneOf away', () => {
  const resource = {
    properties: {
      SourceConfiguration: {
        type: 'object',
        properties: {
          AppIntegrations: { type: 'string' },
        },
        oneOf: [
          {
            required: ['AppIntegrations'],
          },
        ],
        additionalProperties: false,
      },
    },
  };

  const patchedObj = patchObject(resource, patchCloudFormationRegistry);

  expect(patchedObj).toEqual(
    expect.objectContaining({
      properties: {
        SourceConfiguration: {
          type: 'object',
          properties: {
            AppIntegrations: { type: 'string' },
          },
          required: ['AppIntegrations'],
          additionalProperties: false,
        },
      },
    }),
  );
});
