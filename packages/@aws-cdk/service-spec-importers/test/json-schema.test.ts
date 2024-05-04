import { jsonschema } from '../src/types';

test('isOneOf is false for schema containing oneOf constraint and a defined type', () => {
  // GIVEN
  const schema = {
    type: 'object',
    properties: {
      id: {
        type: 'string',
      },
      property1: {
        type: 'string',
      },
      property2: {
        type: 'string',
      },
    },
    required: ['id'],
    oneOf: [{ required: ['property1'] }, { required: ['property2'] }],
    additionalProperties: false,
  } as jsonschema.Schema;

  // WHEN / THEN
  expect(jsonschema.isOneOf(schema)).toEqual(false);
});

test('isOneOf is true for schema containing only oneOf constraint', () => {
  // GIVEN
  const schema = {
    oneOf: [{ required: ['property1'] }, { required: ['property2'] }],
  } as jsonschema.Schema;

  // WHEN / THEN
  expect(jsonschema.isOneOf(schema)).toEqual(true);
});

test('isAnyOf is false for schema containing anyOf constraint and a defined type', () => {
  // GIVEN
  const schema = {
    anyOf: [{ format: 'date-time' }, { format: 'timestamp' }],
    type: 'string',
  } as jsonschema.Schema;

  // WHEN / THEN
  expect(jsonschema.isAnyOf(schema)).toEqual(false);
});

test('isAnyOf is true for schema containing only anyOf constraint', () => {
  // GIVEN
  const schema = {
    anyOf: [{ format: 'date-time' }, { format: 'timestamp' }],
  } as jsonschema.Schema;

  // WHEN / THEN
  expect(jsonschema.isAnyOf(schema)).toEqual(true);
});

test('isAllOf is false for schema containing allOf constraint and a defined type', () => {
  // GIVEN
  const schema = {
    type: 'object',
    properties: {
      id: {
        type: 'string',
      },
      property1: {
        type: 'string',
      },
      property2: {
        type: 'string',
      },
    },
    required: ['id'],
    allOf: [{ required: ['property1'] }, { required: ['property2'] }],
    additionalProperties: false,
  } as jsonschema.Schema;

  // WHEN / THEN
  expect(jsonschema.isAllOf(schema)).toEqual(false);
});

test('isAllOf is true for schema containing only allOf constraint', () => {
  // GIVEN
  const schema = {
    allOf: [{ required: ['property1'] }, { required: ['property2'] }],
  } as jsonschema.Schema;

  // WHEN / THEN
  expect(jsonschema.isAllOf(schema)).toEqual(true);
});
