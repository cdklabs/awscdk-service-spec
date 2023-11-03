export type SortedMultiMap<A, B> = Array<[A, B]>;

/**
 * A sorted map that may contain the same key multiple times
 *
 * Stored as a sorted array of [key, value] pairs, using binary search to locate
 * entries.
 */
export namespace sortedMap {
  export type Comparator<A> = (a: A, b: A) => number;

  export function add<A, B>(map: SortedMultiMap<A, B>, cmp: Comparator<A>, key: A, value: B) {
    const i = lowerBound(map, cmp, key);
    map.splice(i, 0, [key, value]);
  }

  export function find<A, B>(map: SortedMultiMap<A, B>, cmp: Comparator<A>, key: A): B | undefined {
    const i = lowerBound(map, cmp, key);
    if (i === map.length) {
      return undefined;
    }

    const [foundKey, value] = map[i];
    return cmp(foundKey, key) === 0 ? value : undefined;
  }

  export function findAll<A, B>(map: SortedMultiMap<A, B>, cmp: Comparator<A>, key: A): B[] {
    let i = lowerBound(map, cmp, key);

    const ret = [];
    while (i < map.length && cmp(map[i][0], key) === 0) {
      ret.push(map[i][1]);
      i += 1;
    }

    return ret;
  }

  /**
   * Return the index to the first element in the the sorted map
   *
   * @see https://en.cppreference.com/w/cpp/algorithm/lower_bound#Version_2
   */
  function lowerBound<A, B>(map: SortedMultiMap<A, B>, cmp: Comparator<A>, key: A): number {
    let first = 0;
    let count = map.length;

    while (count > 0) {
      let it = first;
      let step = Math.floor(count / 2);
      it += step;

      if (cmp(map[it][0], key) < 0) {
        first = ++it;
        count -= step + 1;
      } else {
        count = step;
      }
    }

    return first;
  }
}
