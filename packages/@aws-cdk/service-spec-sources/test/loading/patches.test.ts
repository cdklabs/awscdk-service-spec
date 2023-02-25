import { JsonLens } from '../../src/loading/patches/json-lens';
import {
  canonicalizeTypeOperators,
  explodeTypeArray,
  recurseAndPatch,
  removeAdditionalProperties,
  removeBooleanPatterns,
  replaceArrayLengthProps,
  Patcher,
} from '../../src/loading/patches/patches';

describe('patches', () => {
  describe(removeAdditionalProperties, () => {
    test('works in the base case', () => {
      const obj = {
        type: 'string',
        additionalProperties: false,
      };

      const patchedObj = recurseAndPatch(obj, removeAdditionalProperties as Patcher<JsonLens>);

      expect(patchedObj).toEqual({
        type: 'string',
      });
    });

    test('does not remove from objects', () => {
      const obj = {
        type: 'object',
        additionalProperties: false,
      };

      const patchedObj = recurseAndPatch(obj, removeAdditionalProperties as Patcher<JsonLens>);

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

      const patchedObj = recurseAndPatch(obj, removeAdditionalProperties as Patcher<JsonLens>);

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

      const patchedObj = recurseAndPatch(obj, replaceArrayLengthProps as Patcher<JsonLens>);

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

      const patchedObj = recurseAndPatch(obj, replaceArrayLengthProps as Patcher<JsonLens>);

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

      const patchedObj = recurseAndPatch(obj, removeBooleanPatterns as Patcher<JsonLens>);

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

      const patchedObj = recurseAndPatch(obj, explodeTypeArray as Patcher<JsonLens>);

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

      const patchedObj = recurseAndPatch(obj, explodeTypeArray as Patcher<JsonLens>);

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
    test('works in base case', () => {
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

      const patchedObj = recurseAndPatch(obj, canonicalizeTypeOperators('oneOf') as Patcher<JsonLens>);

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
  });
});
