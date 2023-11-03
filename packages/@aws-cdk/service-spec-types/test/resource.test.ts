import { ArrayType, MapType, PropertyType, RichPropertyType, TypeUnion } from '../lib';

const numberType: PropertyType = renderable({ type: 'number' }, () => 'number');
const stringType: PropertyType = renderable({ type: 'string' }, () => 'string');
const jsonType: PropertyType = renderable({ type: 'json' }, () => 'json');
const arrayType: <E extends PropertyType>(e: E) => ArrayType<E> = (element) =>
  renderable({ type: 'array', element }, () => `Array<${element}>`);
const mapType: <E extends PropertyType>(e: E) => MapType<E> = (element) =>
  renderable({ type: 'map', element }, () => `Map<${element}>`);
const union: (...e: PropertyType[]) => TypeUnion<PropertyType> = (...types) =>
  renderable({ type: 'union', types }, () => `[${types.join(' | ')}]`);

describe('RichPropertyType', () => {
  describe('assignableTo', () => {
    test.each<[PropertyType, PropertyType, boolean]>([
      // Primitives
      [stringType, numberType, false],
      [jsonType, jsonType, true],
      [numberType, numberType, true],

      // Arrays
      [jsonType, arrayType(numberType), false],
      [arrayType(numberType), jsonType, false],
      [arrayType(stringType), arrayType(numberType), false],
      [arrayType(numberType), arrayType(numberType), true],

      // Maps
      [jsonType, mapType(numberType), false],
      [mapType(numberType), jsonType, false],
      [mapType(stringType), mapType(numberType), false],
      [mapType(numberType), mapType(numberType), true],
      [mapType(numberType), mapType(numberType), true],

      // Unions
      [union(numberType, stringType), stringType, true],
      [union(numberType, stringType), numberType, true],
      [union(numberType, stringType), union(stringType, numberType), true],
      [union(numberType, stringType, jsonType), union(stringType, jsonType), true],
      [union(numberType), union(stringType, jsonType), false],
      [numberType, union(numberType, jsonType), false],
    ])('%s := %s | assignable: %s', (lhs: PropertyType, rhs: PropertyType, isAssignable: boolean) => {
      expect(new RichPropertyType(rhs).assignableTo(lhs)).toBe(isAssignable);
    });
  });
});

function renderable<T>(thing: T, toString: () => string): T {
  (thing as any).toString = toString;
  return thing;
}
