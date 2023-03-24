import { Expression } from './expression';
import { ThingSymbol } from './symbol';
import { TypeDeclaration } from './type-declaration';

/**
 * Interface for classes that are scopes/namespaces
 */
export interface IScope {
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
   * Find the import that makes the given scope visible
   */
  findLink(scope: IScope): IScopeLink | undefined;
}

/**
 * An implementation of the IScope methods
 *
 * Classes can either inherit from this class to automatically satisfy the `IScope` requirements,
 * mix this class into themselves, or declare a private member and delegate all methods.
 */
export class ScopeImpl implements IScope {
  private readonly _typeMap = new Map<string, TypeDeclaration>();
  private readonly linkMap = new Map<IScope, IScopeLink>();
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
    this.linkMap.set(scope, theImport);
  }

  /**
   * Try to find an import for the given scope
   */
  public findLink(scope: IScope): IScopeLink | undefined {
    return this.linkMap.get(scope);
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
    throw new Error(`Type '${fqn}' not found in ${this}`);
  }

  /**
   * Find a type by name in this current scope
   */
  public tryFindTypeByName(name: string): TypeDeclaration | undefined {
    return this.scope.tryFindType(this.scope.qualifyName(name));
  }
}
