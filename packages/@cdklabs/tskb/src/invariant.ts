
export type Invariant = void;

export type EvolutionInvariantPred<A> = (previous: A, current: A) => boolean;

export function evolutionInvariant<A>(description: string, pred: EvolutionInvariantPred<A>): Invariant {
  // TODO: Find a way
  Array.isArray(description);
  Array.isArray(pred);
}

export function implies(x: boolean, y: boolean) {
  return !x || y;
}

/**
 * Implies, but treats 'undefined' as 'false'
 */
export function impliesU(x: boolean | undefined, y: boolean | undefined) {
  return !x || !!y;
}