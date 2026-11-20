/**
 * Make a sorting comparator that will sort by a given sort key
 */
export function sortKeyComparator<A>(keyFn: (x: A) => Array<string | number>) {
  return (a: A, b: A): number => {
    const ak = keyFn(a);
    const bk = keyFn(b);

    for (let i = 0; i < ak.length && i < bk.length; i++) {
      const av = ak[i];
      const bv = bk[i];

      let diff = 0;
      if (typeof av === 'number' && typeof bv === 'number') {
        diff = av - bv;
      } else if (typeof av === 'string' && typeof bv === 'string') {
        diff = av.localeCompare(bv);
      }

      if (diff !== 0) {
        return diff;
      }
    }

    return bk.length - ak.length;
  };
}

/** Order strings by UTF-16 code unit, the same on every machine, unlike `localeCompare` */
export function compareByCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
