import { Expression } from './expression';
import { ThingSymbol } from './symbol';
import { TypeDeclaration } from './type-declaration';

export interface IImport {
  readonly importAlias?: string;
  readonly importedSymbols?: string[];
  readonly moduleSource: string;

  referenceSymbol(sym: ThingSymbol): Expression;
}

/**
 * A place that can hold types
 */
export abstract class Scope {
  public declare abstract readonly fqn: string;
  public declare abstract readonly name: string;
  protected declare abstract readonly typeMap: ReadonlyMap<string, TypeDeclaration>;
  protected readonly importMap: Map<Scope, IImport> = new Map<Scope, IImport>();

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

  /**
   * All imports in this module
   */
  public get imports(): IImport[] {
    return Array.from(this.importMap.values());
  }

  public addImportedScope(scope: Scope, theImport: IImport): void {
    this.importMap.set(scope, theImport);
  }

  /**
   * Try to find an import for the given scope
   */
  public findImportFor(scope: Scope): IImport | undefined {
    return this.importMap.get(scope);
  }

  public toString() {
    return `scope ${this.fqn}`;
  }
}

/**
 * A global scope for things that are already in the environment
 */
export class AmbientScope extends Scope {
  public readonly fqn: string = '<<ambient>>';
  public readonly name: string = '<<ambient>>';

  protected typeMap = new Map<string, TypeDeclaration>();
  public addType(_type: TypeDeclaration): void {}
}

export const AMBIENT_SCOPE = new AmbientScope();
