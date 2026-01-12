import { Module, TypeScriptRenderer } from '../src';

test('duplicate selective imports from same source should merge', () => {
  const source = new Module('source');
  const target = new Module('target');

  source.importSelective(target, ['foo']);
  source.importSelective(target, ['bar']);

  const ts = new TypeScriptRenderer();
  expect(ts.render(target)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    import { bar, foo } from "source";"
  `);
});

test('selective imports with aliases from same source should merge', () => {
  const source = new Module('source');
  const target = new Module('target');

  source.importSelective(target, [['foo', 'f']]);
  source.importSelective(target, [['bar', 'b']]);

  const ts = new TypeScriptRenderer();
  expect(ts.render(target)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    import { bar as b, foo as f } from "source";"
  `);
});

test('mixed regular and aliased selective imports from same source should merge', () => {
  const source = new Module('source');
  const target = new Module('target');

  source.importSelective(target, ['foo']);
  source.importSelective(target, [['bar', 'b']]);
  source.importSelective(target, ['baz']);

  const ts = new TypeScriptRenderer();
  expect(ts.render(target)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    import { bar as b, baz, foo } from "source";"
  `);
});

test('imports from different sources should remain separate', () => {
  const source1 = new Module('source1');
  const source2 = new Module('source2');
  const target = new Module('target');

  source1.importSelective(target, ['foo']);
  source2.importSelective(target, ['bar']);

  const ts = new TypeScriptRenderer();
  expect(ts.render(target)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    import { foo } from "source1";
    import { bar } from "source2";"
  `);
});

test('aliased module imports should not merge with selective imports', () => {
  const source = new Module('source');
  const target = new Module('target');

  source.import(target, 'S');
  source.importSelective(target, ['foo']);

  const ts = new TypeScriptRenderer();
  expect(ts.render(target)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    import * as S from "source";
    import { foo } from "source";"
  `);
});

test('multiple aliased module imports from same source should remain separate', () => {
  const source = new Module('source');
  const target = new Module('target');

  source.import(target, 'S1');
  source.import(target, 'S2');

  const ts = new TypeScriptRenderer();
  expect(ts.render(target)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    import * as S1 from "source";
    import * as S2 from "source";"
  `);
});

test('deduplication with custom fromLocation', () => {
  const source = new Module('source');
  const target = new Module('target');

  source.importSelective(target, ['foo'], { fromLocation: './custom' });
  source.importSelective(target, ['bar'], { fromLocation: './custom' });

  const ts = new TypeScriptRenderer();
  expect(ts.render(target)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    import { bar, foo } from "./custom";"
  `);
});

test('different fromLocations should not merge', () => {
  const source = new Module('source');
  const target = new Module('target');

  source.importSelective(target, ['foo'], { fromLocation: './path1' });
  source.importSelective(target, ['bar'], { fromLocation: './path2' });

  const ts = new TypeScriptRenderer();
  expect(ts.render(target)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    import { foo } from "./path1";
    import { bar } from "./path2";"
  `);
});

test('complex scenario with multiple sources and mixed imports', () => {
  const source1 = new Module('source1');
  const source2 = new Module('source2');
  const target = new Module('target');

  source1.importSelective(target, ['a']);
  source2.import(target, 'S2');
  source1.importSelective(target, [['b', 'B']]);
  source2.importSelective(target, ['c']);
  source1.importSelective(target, ['d']);

  const ts = new TypeScriptRenderer();
  expect(ts.render(target)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    import { a, b as B, d } from "source1";
    import * as S2 from "source2";
    import { c } from "source2";"
  `);
});

test('same import added twice should deduplicate', () => {
  const source = new Module('source');
  const target = new Module('target');

  source.importSelective(target, ['foo']);
  source.importSelective(target, ['foo']);

  const ts = new TypeScriptRenderer();
  expect(ts.render(target)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    import { foo } from "source";"
  `);
});

test('same import with different aliases should keep both', () => {
  const source = new Module('source');
  const target = new Module('target');

  source.importSelective(target, [['foo', 'f1']]);
  source.importSelective(target, [['foo', 'f2']]);

  const ts = new TypeScriptRenderer();
  expect(ts.render(target)).toMatchInlineSnapshot(`
    "/* eslint-disable prettier/prettier, @stylistic/max-len */
    import { foo as f1, foo as f2 } from "source";"
  `);
});
