import { JsonLens } from '../../src/loading/patches/json-lens';
import { applyPatcher, Patcher } from '../../src/loading/patches/patching';
import {
  canonicalizeTypeOperators,
  minimizeTypeOperators,
  explodeTypeArray,
  removeAdditionalProperties,
  removeBooleanPatterns,
  replaceArrayLengthProps,
} from '../../src/loading/patches/registry-patches';

describe('patches', () => {
  describe(removeAdditionalProperties, () => {
    test('works in the base case', () => {
      const obj = {
        type: 'string',
        additionalProperties: false,
      };

      const patchedObj = applyPatcher(obj, removeAdditionalProperties as Patcher<JsonLens>);

      expect(patchedObj).toEqual({
        type: 'string',
      });
    });

    test('does not remove from objects', () => {
      const obj = {
        type: 'object',
        additionalProperties: false,
      };

      const patchedObj = applyPatcher(obj, removeAdditionalProperties as Patcher<JsonLens>);

      expect(patchedObj).toEqual(obj);
    });

    test('works in embedded properties', () => {
      const obj = {
        type: 'object',
        properties: {
          Prop: {
            type: 'array',
            minItems: 1,
            additionalProperties: false,
          },
        },
      };

      const patchedObj = applyPatcher(obj, removeAdditionalProperties as Patcher<JsonLens>);

      expect(patchedObj).toEqual({
        type: 'object',
        properties: {
          Prop: {
            type: 'array',
            minItems: 1,
          },
        },
      });
    });
  });

  describe(replaceArrayLengthProps, () => {
    test('works in the base case', () => {
      const obj = {
        type: 'array',
        minLength: 1,
        maxLength: 2,
      };

      const patchedObj = applyPatcher(obj, replaceArrayLengthProps as Patcher<JsonLens>);

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

      const patchedObj = applyPatcher(obj, replaceArrayLengthProps as Patcher<JsonLens>);

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

      const patchedObj = applyPatcher(obj, removeBooleanPatterns as Patcher<JsonLens>);

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

      const patchedObj = applyPatcher(obj, explodeTypeArray as Patcher<JsonLens>);

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

      const patchedObj = applyPatcher(obj, explodeTypeArray as Patcher<JsonLens>);

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

      const patchedObj = applyPatcher(obj, canonicalizeTypeOperators('oneOf') as Patcher<JsonLens>);

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

      const patchedObj = applyPatcher(obj, canonicalizeTypeOperators('anyOf') as Patcher<JsonLens>);

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

      const patchedObj = applyPatcher(obj, canonicalizeTypeOperators('anyOf') as Patcher<JsonLens>);

      expect(patchedObj).toEqual(obj);
    });
  });

  describe(minimizeTypeOperators, () => {
    test('removes type operators with 1 element', () => {
      const obj = {
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

      const patchedObj = applyPatcher(obj, minimizeTypeOperators as Patcher<JsonLens>);

      expect(patchedObj).toEqual({
        anyOf: [
          {
            required: ['FirehoseArn', 'RoleArn', 'OutputFormat'],
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
      });
    });
  });
});
