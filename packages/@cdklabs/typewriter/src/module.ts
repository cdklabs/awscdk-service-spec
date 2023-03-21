import { Expression } from './expression';
import { ObjectPropertyAccess } from './expressions';
import { Identifier } from './expressions/identifier';
import { IScope, IScoped, isScoped, ScopeImpl } from './scope';
import { StructType } from './struct';
import { ThingSymbol } from './symbol';

/**
 * A module
 */
export class Module extends ScopeImpl {
  /**
   * Find the containing module of the scoped item
   */
  public static of(scoped: IScoped): Module {
    let current = scoped;

    while (true) {
      const parent = current.scope;

      if (parent instanceof Module) {
        return parent;
      }
      if (!isScoped(parent)) {
        throw new Error(`${scoped} is not inside a Module`);
      }

      current = parent;
    }
  }

  private readonly _imports = new Array<ModuleImport>();
  public readonly imports: ReadonlyArray<ModuleImport> = this._imports;

  public get name(): string {
    return this.fqn;
  }

  public constructor(fqn: string) {
    super(fqn);
  }

  /**
   * All interfaces in this module/namespace (not submodules)
   */
  public get interfaces(): readonly StructType[] {
    return this.types.filter((t) => t instanceof StructType).map((t) => t as StructType);
  }

  /**
   * Add an import of another module into the current module
   */
  public addImport(imp: ModuleImport) {
    this._imports.push(imp);
    imp.linkInto(this);
  }

  /**
   * Import the current module into the target module
   */
  public import(intoModule: Module, as: string, props: ModuleImportProps = {}) {
    intoModule.addImport(new AliasedModuleImport(this, props.fromLocation ?? this.fqn, as));
  }

  public toString() {
    return `module '${this.fqn}'`;
  }
}

export abstract class ModuleImport {
  constructor(public readonly module: Module, public readonly moduleSource: string) {}

  /**
   * Make the current module import create the appropriate link in the given scope
   */
  public abstract linkInto(scope: IScope): void;
}

/**
 * An import statement
 *
 * Import statements get rendered into the source module, and also count as scope linkage.
 */
export class AliasedModuleImport extends ModuleImport {
  constructor(module: Module, moduleSource: string, public readonly importAlias: string) {
    super(module, moduleSource);
  }

  public linkInto(scope: IScope): void {
    scope.linkScope(this.module, {
      referenceSymbol: (sym: ThingSymbol): Expression => {
        // We just assume that this symbol exists. We can't properly check it, yet...
        return new ObjectPropertyAccess(new Identifier(this.importAlias), sym.name);
      },
    });
  }
}

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
