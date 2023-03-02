import { Type } from './type';

/**
 * A place that can hold types
 */
export abstract class Scope {
  public declare abstract readonly fqn: string;
  public declare abstract readonly name: string;
  protected declare abstract readonly typeMap: ReadonlyMap<string, Type>;

  /**
   * All direct types in this scope
   */
  public get types(): readonly Type[] {
    return Array.from(this.typeMap.values());
  }

  /**
   * Register a type to the scope
   */
  public abstract addType(type: Type): void;

  /**
   * Register a import to the scope
   */
  public abstract addImport(scope: Scope, name: string): void;

  public tryFindType(fqnOrName: string): Type | undefined {
    return this.typeMap.get(fqnOrName) || this.typeMap.get(`${this.fqn}.${fqnOrName}`);
  }

  /**
   * Find type by FQN or Name
   */
  public findType(fqnOrName: string): Type {
    const ownType = this.tryFindType(fqnOrName);
    if (ownType) {
      return ownType;
    }
    throw new Error(`Type '${fqnOrName}' not found in assembly ${this.name}`);
  }
}
