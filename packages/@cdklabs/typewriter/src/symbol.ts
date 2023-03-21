import { IScope } from './scope';

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
  constructor(public readonly name: string, public readonly scope: IScope) {}

  /**
   * Change the name of a symbol while keeping the scope the same
   */
  public changeName(newName: string | ((x: string) => string)) {
    if (typeof newName === 'string') {
      return new ThingSymbol(newName, this.scope);
    } else {
      return new ThingSymbol(newName(this.name), this.scope);
    }
  }

  public toString() {
    return this.name;
  }
}
