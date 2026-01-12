import { Module, TypeScriptRenderer } from '../src';

test('import order should be preserved - selective then aliased', () => {
  const source1 = new Module('source1');
  const source2 = new Module('source2');
  const target = new Module('target');

  // Add selective import first
  source1.importSelective(target, ['foo']);
  // Then add aliased import
  source2.import(target, 'S2');

  const ts = new TypeScriptRenderer();
  const result = ts.render(target);

  // Should preserve order: selective first, then aliased
  expect(result).toContain('import { foo } from "source1";\nimport * as S2 from "source2";');
});

test('import order should be preserved - aliased then selective', () => {
  const source1 = new Module('source1');
  const source2 = new Module('source2');
  const target = new Module('target');

  // Add aliased import first
  source1.import(target, 'S1');
  // Then add selective import
  source2.importSelective(target, ['bar']);

  const ts = new TypeScriptRenderer();
  const result = ts.render(target);

  // Should preserve order: aliased first, then selective
  expect(result).toContain('import * as S1 from "source1";\nimport { bar } from "source2";');
});

test('import order should be preserved - mixed sequence', () => {
  const source1 = new Module('source1');
  const source2 = new Module('source2');
  const source3 = new Module('source3');
  const target = new Module('target');

  // Mixed sequence
  source1.importSelective(target, ['a']);
  source2.import(target, 'S2');
  source3.importSelective(target, ['c']);

  const ts = new TypeScriptRenderer();
  const result = ts.render(target);

  // Should preserve order
  const lines = result.split('\n').filter((line) => line.startsWith('import'));
  expect(lines).toEqual([
    'import { a } from "source1";',
    'import * as S2 from "source2";',
    'import { c } from "source3";',
  ]);
});

test('complex import ordering edge cases', () => {
  const source1 = new Module('source1');
  const source2 = new Module('source2');
  const source3 = new Module('source3');
  const target = new Module('target');

  // Complex sequence: selective -> aliased -> selective (same source) -> aliased (different source) -> selective (new source)
  source1.importSelective(target, ['a']);
  source1.import(target, 'S1');
  source1.importSelective(target, ['b']); // we expect this to be merged into the first selective import
  source2.import(target, 'S2');
  source3.importSelective(target, ['c']);

  const ts = new TypeScriptRenderer();
  const result = ts.render(target);

  const lines = result.split('\n').filter((line) => line.startsWith('import'));
  expect(lines).toEqual([
    'import { a, b } from "source1";',
    'import * as S1 from "source1";',
    'import * as S2 from "source2";',
    'import { c } from "source3";',
  ]);
});

test('multiple aliased imports from same source preserve order', () => {
  const source = new Module('source');
  const target = new Module('target');

  source.import(target, 'First');
  source.import(target, 'Second');
  source.import(target, 'Third');

  const ts = new TypeScriptRenderer();
  const result = ts.render(target);

  const lines = result.split('\n').filter((line) => line.startsWith('import'));
  expect(lines).toEqual([
    'import * as First from "source";',
    'import * as Second from "source";',
    'import * as Third from "source";',
  ]);
});
