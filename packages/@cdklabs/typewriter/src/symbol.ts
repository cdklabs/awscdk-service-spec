import { Scope } from './scope';

/**
 * Kinds of types.
 */
export enum SymbolKind {
  Class = 'class',
  Enum = 'enum',
  Struct = 'struct',
  Interface = 'interface',
  Function = 'function',
}

/**
 * A symbol is a name for a thing that lives in a scope.
 *
 * It is not renderable by itself, but it can be converted into to an
 * 'Expression' by looking it up against (for example) imports. The Expression
 * will be renderable.
 *
 * Symbols currently aren't annotated with what they refer to... but they could be.
 */
export class ThingSymbol {
  constructor(public readonly name: string, public readonly scope: Scope) {}

  public toString() {
    return this.name;
  }
}
