import { sortedMap, SortedMultiMap } from '../src/sorted-map';


function buildTwoArrays(): [SortedMultiMap<string, string>, Array<string>] {
  const smap: SortedMultiMap<string, string> = [];
  const sortedArray = new Array<string>();

  for (let j = 0; j < 20; j++) {
    const x = randomString();
    sortedArray.push(x);
    sortedMap.add(smap, stringCmp, x, x);
  }

  sortedArray.sort();
  return [smap, sortedArray];
}

test('sorted map behaves like a regular array, sorted', () => {
  for (let i = 0; i < 100; i++) {
    const [smap, regularArray] = buildTwoArrays();

    const smapKeys = smap.map(([k, _]) => k);
    expect(smapKeys).toEqual(regularArray);
  }
});

test('can add elements and find them back', () => {
  for (let i = 0; i < 100; i++) {
    const [smap, regularArray] = buildTwoArrays();

    for (const x of regularArray) {
      expect(sortedMap.find(smap, stringCmp, x)).toEqual(x);
    }
  }
});

function stringCmp(a: string, b: string) {
  return a.localeCompare(b);
}

function randomString() {
  return Math.random().toString(36).slice(2);
}