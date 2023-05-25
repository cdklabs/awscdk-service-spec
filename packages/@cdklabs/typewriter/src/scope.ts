import { Expression } from './expression';
import { Identifier } from './expressions';
import { ThingSymbol } from './symbol';
import { TypeDeclaration } from './type-declaration';

/**
 * Interface for classes that are scopes/namespaces
 */
export interface IScope {
  readonly fqn: string;

  /**
   * The set of type declarations in this scope
   */
  readonly typeMap: ReadonlyMap<string, TypeDeclaration>;

  /**
   * Turn a declaration name into a declaration FQN
   */
  qualifyName(name: string): string;

  /**
   * Register a type to the scope
   */
  registerType(type: TypeDeclaration): void;

  /**
   * Try find a type by FQN
   */
  tryFindType(fqn: string): TypeDeclaration | undefined;

  /**
   * Register a visible other scope into this scope
   */
  linkScope(scope: IScope, theImport: IScopeLink): void;

  /**
   * Register a visible symbol in this scope
   */
  linkSymbol(sym: ThingSymbol, alias: Expression): void;

  /**
   * Turn a symbol into an expression that can be used to reference the symbol in this scope
   */
  symbolToExpression(symbol: ThingSymbol): Expression | undefined;
}

/**
 * An implementation of the IScope methods
 *
 * Classes can either inherit from this class to automatically satisfy the `IScope` requirements,
 * mix this class into themselves, or declare a private member and delegate all methods.
 */
export class ScopeImpl implements IScope {
  private readonly _typeMap = new Map<string, TypeDeclaration>();
  private readonly linkMap = new Map<string, IScopeLink>();
  private readonly symbolMap = new Map<string, Map<string, Expression>>();
  public readonly typeMap: ReadonlyMap<string, TypeDeclaration> = this._typeMap;

  constructor(public readonly fqn: string) {}

  public qualifyName(name: string): string {
    return `${this.fqn}.${name}`;
  }

  /**
   * All direct types in this scope
   */
  public get types(): readonly TypeDeclaration[] {
    return Array.from(this._typeMap.values());
  }

  /**
   * Register a type to the scope
   */
  public registerType(type: TypeDeclaration) {
    if (this._typeMap.has(type.fqn)) {
      throw new Error(`There is already a declaration named ${type.fqn} in ${this}`);
    }
    this._typeMap.set(type.fqn, type);
  }

  public tryFindType(fqnOrName: string): TypeDeclaration | undefined {
    return this._typeMap.get(fqnOrName);
  }

  public linkScope(scope: IScope, theImport: IScopeLink): void {
    this.linkMap.set(scope.fqn, theImport);
  }

  public linkSymbol(sym: ThingSymbol, alias: Expression): void {
    let map = this.symbolMap.get(sym.scope.fqn);
    if (!map) {
      map = new Map();
      this.symbolMap.set(sym.scope.fqn, map);
    }
    map.set(sym.name, alias);
  }

  /**
   * Try to resolve this symbol here
   */
  public symbolToExpression(sym: ThingSymbol): Expression | undefined {
    // Defining scope is visible, so identifiers in it are as well
    if (sym.scope === this) {
      return new Identifier(sym.name);
    }

    const expr = this.symbolMap.get(sym.scope.fqn)?.get(sym.name);
    if (expr) {
      return expr;
    }

    const imp = this.linkMap.get(sym.scope.fqn);
    if (imp) {
      return imp.referenceSymbol(sym);
    }

    return undefined;
  }
}

/**
 * A global scope for things that are already in the target environment
 */
export const AMBIENT_SCOPE = new ScopeImpl('<<ambient>>');

/**
 * Link one scope to another (make symbols from the linked scope visible in the current one)
 */
export interface IScopeLink {
  /**
   * Return an expression that will reference the given symbol
   */
  referenceSymbol(sym: ThingSymbol): Expression;
}

/**
 * All things that have a scope
 */
export interface IScoped {
  readonly scope: IScope;
}

export function isScoped(x: unknown): x is IScoped {
  return !!x && typeof x === 'object' && (x as any).scope !== undefined;
}

/**
 * Common operations that can be performed on anything that's an IScope
 */
export class RichScope {
  constructor(private readonly scope: IScope) {}

  /**
   * Find type by FQN, throwing an error if not found
   */
  public findType(fqn: string): TypeDeclaration {
    const ownType = this.scope.tryFindType(fqn);
    if (ownType) {
      return ownType;
    }
    debugger;
    throw new Error(`Type '${fqn}' not found in ${this.scope}`);
  }

  /**
   * Find a type by name in this current scope
   */
  public tryFindTypeByName(name: string): TypeDeclaration | undefined {
    return this.scope.tryFindType(this.scope.qualifyName(name));
  }
}
