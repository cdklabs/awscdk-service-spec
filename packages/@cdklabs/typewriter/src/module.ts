import { Expression } from './expression';
import { ObjectPropertyAccess } from './expressions';
import { Identifier } from './expressions/identifier';
import { IImport, Scope } from './scope';
import { StructType } from './struct';
import { ThingSymbol } from './symbol';
import { TypeDeclaration } from './type-declaration';

/**
 * Props to change module import behavior
 */
export interface ModuleImportProps {
  /**
   * Override the location the module is imported from
   * @default - FQN of the imported module
   */
  readonly fromLocation?: string;
}

/**
 * A module
 */
export class Module extends Scope {
  protected readonly typeMap: Map<string, TypeDeclaration> = new Map<string, TypeDeclaration>();

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
   * All interfaces in this module/namespace (not submodules)
   */
  public get interfaces(): readonly StructType[] {
    return this.types.filter((t) => t instanceof StructType).map((t) => t as StructType);
  }

  public addType(type: TypeDeclaration): void {
    this.typeMap.set(type.fqn, type);
  }

  public import(intoModule: Module, as: string, props: ModuleImportProps = {}) {
    intoModule.addImportedScope(this, new AliasedModuleImport(props.fromLocation ?? this.fqn, as));
  }

  public toString() {
    return `module '${this.fqn}'`;
  }
}

class AliasedModuleImport implements IImport {
  constructor(public readonly moduleSource: string, public readonly importAlias: string) {}

  referenceSymbol(sym: ThingSymbol): Expression {
    // We just assume that this symbol exists. We can't properly check it, yet...
    return new ObjectPropertyAccess(new Identifier(this.importAlias), sym.name);
  }
}
