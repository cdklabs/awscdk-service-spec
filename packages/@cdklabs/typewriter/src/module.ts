import { StructType } from './struct';
import { Scope } from './scope';
import { TypeDeclaration } from './type-declaration';
import { ObjectLike } from './expressions/objects';
import { Identifier } from './expressions/identifier';
import { Expression } from './expression';
import { InvokeCallable } from './expressions';

/**
 * A module
 */
export class Module extends Scope {
  protected readonly typeMap: Map<string, TypeDeclaration> = new Map<string, TypeDeclaration>();
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
  public get types(): TypeDeclaration[] {
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
  public get interfaces(): readonly StructType[] {
    return this.types.filter((t) => t instanceof StructType).map((t) => t as StructType);
  }

  public addType(type: TypeDeclaration): void {
    this.typeMap.set(type.fqn, type);
  }

  public addImport(scope: Scope, name: string): void {
    this.importMap.set(name, scope);
  }

  public import(module: Module, as: string): AliasedModuleImport {
    module.addImport(this, as);
    return new AliasedModuleImport(this, as);
  }
}

export class AliasedModuleImport implements ObjectLike {
  comments?: string[] | undefined;
  constructor(public readonly module: Module, public readonly as: string) {}

  public prop(property: string): Identifier {
    const type = this.module.tryFindType(property);
    if (!type) {
      throw new Error(`Module ${this.module.fqn} does not have member ${property}`);
    }
    return new Identifier(`${this.as}.${property}`);
  }

  public invoke(method: string, ...args: Expression[]): Expression {
    return new InvokeCallable(this.prop(method), args);
  }
}
