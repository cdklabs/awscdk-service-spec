import { canonicalizeOneOf, canonicalizeUnionType, recurseAndPatch, removeAdditionalProperties, removeBooleanPatterns, replaceArrayLengthProps } from '../../src/loading/patches/patches';

describe('patches', () => {
  describe(removeAdditionalProperties, () => {
    test('works in the base case', () => {
      const obj = {
        type: 'string',
        additionalProperties: false,
      };

      const patchedObj = recurseAndPatch(obj, removeAdditionalProperties);

      expect(patchedObj).toEqual({
        type: 'string',
      });
    });

    test('does not remove from objects', () => {
      const obj = {
        type: 'object',
        additionalProperties: false,
      };

      const patchedObj = recurseAndPatch(obj, removeAdditionalProperties);

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

      const patchedObj = recurseAndPatch(obj, removeAdditionalProperties);

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

      const patchedObj = recurseAndPatch(obj, replaceArrayLengthProps);

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

      const patchedObj = recurseAndPatch(obj, replaceArrayLengthProps);

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

      const patchedObj = recurseAndPatch(obj, removeBooleanPatterns);

      expect(patchedObj).toEqual({
        type: 'boolean',
      });
    });
  });

  describe(canonicalizeUnionType, () => {
    test('works in the base case', () => {
      const obj = {
        type: ['string', 'object'],
      };

      const patchedObj = recurseAndPatch(obj, canonicalizeUnionType);

      expect(patchedObj).toEqual({
        oneOf: [{
          type: 'string',
        }, {
          type: 'object',
        }],
      });
    });

    test('works when object has other properties', () => {
      const obj = {
        type: ['string', 'object'],
        additionalProperties: false,
        minLength: 0,
      };

      const patchedObj = recurseAndPatch(obj, canonicalizeUnionType);

      expect(patchedObj).toEqual({
        oneOf: [{
          type: 'string',
          additionalProperties: false,
          minLength: 0,
        }, {
          type: 'object',
          additionalProperties: false,
          minLength: 0,
        }],
      });
    });
  });

  describe(canonicalizeOneOf, () => {
    test('works in base case', () => {
      const obj = {
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
          oneOf: [{
            required: ['Name'],
          }, {
            required: ['Attribute'],
          }],
        },
      };

      const patchedObj = recurseAndPatch(obj, canonicalizeOneOf);

      expect(patchedObj).toEqual({
        Prop: {
          oneOf: [{
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
            required: ['RequiredAttribute', 'Name'],
          }, {
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
            required: ['RequiredAttribute', 'Attribute'],
          }],
        },
      });
    });
  });
});