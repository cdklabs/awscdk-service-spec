import { InterfaceType } from './interface';
import { Scope } from './scope';
import { Type } from './type';

/**
 * A module
 */
export class Module extends Scope {
  protected readonly typeMap: Map<string, Type> = new Map<string, Type>();
  protected readonly importMap: Map<string, Scope> = new Map<string, Scope>();

  public get name(): string {
    return this.fqn;
  }

  public constructor(public readonly fqn: string) {
    super();
  }

  /**
   * All types in this module/namespace (not submodules)
   */
  public get types(): Type[] {
    return Array.from(this.typeMap.values());
  }

  /**
   * All imports in this module
   */
  public get imports(): Array<[string, Scope]> {
    return Array.from(this.importMap.entries());
  }

  /**
   * All interfaces in this module/namespace (not submodules)
   */
  public get interfaces(): readonly InterfaceType[] {
    return this.types.filter((t) => t instanceof InterfaceType).map((t) => t as InterfaceType);
  }

  public addType(type: Type): void {
    this.typeMap.set(type.fqn, type);
  }

  public addImport(scope: Scope, name: string): void {
    this.importMap.set(name, scope);
  }
}
