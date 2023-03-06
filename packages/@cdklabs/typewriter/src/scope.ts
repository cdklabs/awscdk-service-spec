import { TypeDeclaration } from './type-declaration';

/**
 * A place that can hold types
 */
export abstract class Scope {
  public declare abstract readonly fqn: string;
  public declare abstract readonly name: string;
  protected declare abstract readonly typeMap: ReadonlyMap<string, TypeDeclaration>;

  /**
   * All direct types in this scope
   */
  public get types(): readonly TypeDeclaration[] {
    return Array.from(this.typeMap.values());
  }

  /**
   * Register a type to the scope
   */
  public abstract addType(type: TypeDeclaration): void;

  /**
   * Register a import to the scope
   */
  public abstract addImport(scope: Scope, name: string): void;

  public tryFindType(fqnOrName: string): TypeDeclaration | undefined {
    return this.typeMap.get(fqnOrName) || this.typeMap.get(`${this.fqn}.${fqnOrName}`);
  }

  /**
   * Find type by FQN or Name
   */
  public findType(fqnOrName: string): TypeDeclaration {
    const ownType = this.tryFindType(fqnOrName);
    if (ownType) {
      return ownType;
    }
    throw new Error(`Type '${fqnOrName}' not found in assembly ${this.name}`);
  }
}
