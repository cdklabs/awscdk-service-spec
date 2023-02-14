
export type SortedMultiMap<A, B> = Array<[A, B]>;

export namespace sortedMap {
  export type Comparator<A> = (a: A, b: A) => number;

  export function add<A, B>(map: SortedMultiMap<A, B>, cmp: Comparator<A>, key: A, value: B) {
    const i = firstNotBefore(map, cmp, key);
    map.splice(i, 0, [key, value]);
  }

  export function find<A, B>(map: SortedMultiMap<A, B>, cmp: Comparator<A>, key: A): B | undefined {
    const i = firstNotBefore(map, cmp, key);
    if (i === map.length) { return undefined; }

    const [foundKey, value] = map[i];
    return cmp(foundKey, key) === 0 ? value : undefined;
  }

  export function findAll<A, B>(map: SortedMultiMap<A, B>, cmp: Comparator<A>, key: A): B[] {
    let i = firstNotBefore(map, cmp, key);

    const ret = [];
    while (i < map.length && cmp(map[i][0], key) === 0) {
      ret.push(map[i][1]);
      i += 1;
    }

    return ret;
  }

  /**
   * Return the first index that doesn't come fully before key
   *
   * It is either key itself, or a something after key
   */
  function firstNotBefore<A, B>(map: SortedMultiMap<A, B>, cmp: Comparator<A>, key: A): number {
    let lo = 0;
    let hi = map.length;

    while (lo < hi) {
      const mid = lo + Math.floor((hi - lo) / 2);

      const c = cmp(key, map[mid][0]);

      if (c < 0) {
        hi = mid;
      } else if (c > 0) {
        lo = mid + 1;
      } else {
        // Found it exactly
        return mid;
      }
    }

    return lo;
  }
}
