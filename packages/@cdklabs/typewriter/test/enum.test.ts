import { EnumType, Module, TypeScriptRenderer } from '../src';

const renderer = new TypeScriptRenderer();
let scope: Module;

beforeEach(() => {
  scope = new Module('typewriter.test');
});

test('basic enum', () => {
  new EnumType(scope, {
    name: 'Color',
    members: [{ name: 'RED' }, { name: 'GREEN' }, { name: 'BLUE' }],
  });

  expect(renderer.render(scope)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    enum Color {
      RED,
      GREEN,
      BLUE,
    }"
  `);
});

test('enum with string values', () => {
  new EnumType(scope, {
    name: 'Status',
    members: [
      { name: 'PENDING', value: 'pending' },
      { name: 'ACTIVE', value: 'active' },
      { name: 'COMPLETED', value: 'completed' },
    ],
  });

  expect(renderer.render(scope)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    enum Status {
      PENDING = "pending",
      ACTIVE = "active",
      COMPLETED = "completed",
    }"
  `);
});

test('enum with numeric values', () => {
  new EnumType(scope, {
    name: 'Priority',
    members: [
      { name: 'LOW', value: 1 },
      { name: 'MEDIUM', value: 2 },
      { name: 'HIGH', value: 3 },
    ],
  });

  expect(renderer.render(scope)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    enum Priority {
      LOW = 1,
      MEDIUM = 2,
      HIGH = 3,
    }"
  `);
});

test('exported enum', () => {
  new EnumType(scope, {
    name: 'Direction',
    export: true,
    members: [{ name: 'NORTH' }, { name: 'SOUTH' }, { name: 'EAST' }, { name: 'WEST' }],
  });

  expect(renderer.render(scope)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    export enum Direction {
      NORTH,
      SOUTH,
      EAST,
      WEST,
    }"
  `);
});

test('const enum', () => {
  new EnumType(scope, {
    name: 'HttpStatus',
    export: true,
    const: true,
    members: [
      { name: 'OK', value: 200 },
      { name: 'NOT_FOUND', value: 404 },
      { name: 'SERVER_ERROR', value: 500 },
    ],
  });

  expect(renderer.render(scope)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    export const enum HttpStatus {
      OK = 200,
      NOT_FOUND = 404,
      SERVER_ERROR = 500,
    }"
  `);
});

test('enum with documentation', () => {
  new EnumType(scope, {
    name: 'LogLevel',
    export: true,
    docs: { summary: 'Logging levels for the application' },
    members: [
      { name: 'DEBUG', value: 0, docs: 'Debug level logging' },
      { name: 'INFO', value: 1, docs: 'Info level logging' },
      { name: 'ERROR', value: 2, docs: 'Error level logging' },
    ],
  });

  expect(renderer.render(scope)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    /**
     * Logging levels for the application
     */
    export enum LogLevel {
      /** Debug level logging */
      DEBUG = 0,
      /** Info level logging */
      INFO = 1,
      /** Error level logging */
      ERROR = 2,
    }"
  `);
});

test('enum with addMember', () => {
  const e = new EnumType(scope, {
    name: 'Animal',
  });

  e.addMember({ name: 'DOG' });
  e.addMember({ name: 'CAT' });
  e.addMember({ name: 'BIRD' });

  expect(renderer.render(scope)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    enum Animal {
      DOG,
      CAT,
      BIRD,
    }"
  `);
});

test('create enum from an array', () => {
  const e = new EnumType(scope, {
    name: 'Pets',
  });

  const petArr = ['cat', 'dog', 'fish'];

  for (const pet of petArr) {
    e.addMember({ name: pet });
  }

  expect(renderer.render(scope)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    enum Pets {
      cat,
      dog,
      fish,
    }"
  `);
});
