import { InterfaceType } from './interface';
import { Scope } from './scope';
import { Type } from './type';

/**
 * A module
 */
export class Module extends Scope {
  protected readonly typeMap: Map<string, Type> = new Map<string, Type>();

  public get name(): string {
    return this.fqn;
  }

  public constructor(public readonly fqn: string) {
    super();
  }

  /**
   * All types in this module/namespace (not submodules)
   */
  public get types(): readonly Type[] {
    return Array.from(this.typeMap.values());
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
}
