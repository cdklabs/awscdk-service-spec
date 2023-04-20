import {
  canonicalizeTypeOperators,
  explodeTypeArray,
  missingTypeObject,
  removeEmptyRequiredArray,
} from '../../src/patches/json-schema-patches';
import { Patcher, applyPatcher, JsonLens, JsonObjectLens } from '../../src/patching';
import { patchObject } from '../utils';

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

describe(missingTypeObject, () => {
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

    const patchedObj = patchObject(obj, missingTypeObject);

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
