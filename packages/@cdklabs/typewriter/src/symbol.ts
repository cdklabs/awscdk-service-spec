import { IScope, RichScope } from './scope';

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

  /**
   * Find the declaration that this symbol references
   */
  public findDeclaration() {
    return new RichScope(this.scope).findType(this.scope.qualifyName(this.name));
  }

  public toString() {
    return this.name;
  }
}
