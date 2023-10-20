import { PrintableTree } from '../src/printable-tree';

test('adding subtrees with bullets', () => {
  const tree = new PrintableTree();

  tree.addBullets([new PrintableTree('first'), new PrintableTree('second'), new PrintableTree('third')]);

  expect(tree.toString()).toMatchInlineSnapshot(`
    "├first
    ├second
    └third"
  `);
});

test('adding subtrees skips empty trees', () => {
  const tree = new PrintableTree();

  tree.addBullets([new PrintableTree('first'), new PrintableTree(...[]), new PrintableTree('third')]);

  expect(tree.toString()).toMatchInlineSnapshot(`
    "├first
    └third"
  `);
});

test('adding subtrees skips empty first tree', () => {
  const tree = new PrintableTree();

  tree.addBullets([new PrintableTree(...[]), new PrintableTree('first'), new PrintableTree('third')]);

  expect(tree.toString()).toMatchInlineSnapshot(`
    "├first
    └third"
  `);
});

test('addTree to an empty tree doesnt add newlines', () => {
  const tree = new PrintableTree();
  tree.addTree(new PrintableTree('xyz'));
  expect(tree.toString()).toEqual('xyz');
});
