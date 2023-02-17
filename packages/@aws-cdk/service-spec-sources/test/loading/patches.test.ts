import { recurseAndPatch, removeAdditionalProperties } from '../../src/loading/json-patcher';

describe('patches', () => {
  describe('removeAdditionalProperties', () => {
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
});