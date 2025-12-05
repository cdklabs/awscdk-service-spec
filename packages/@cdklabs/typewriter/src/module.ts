import { Expression, ObjectPropertyAccess } from './expressions';
import * as expr from './expressions/builder';
import { Identifier } from './expressions/identifier';
import { IScope, IScoped, isScoped, ScopeImpl } from './scope';
import { Statement } from './statements';
import { StructType } from './struct';
import { ThingSymbol } from './symbol';
import { Type } from './type';

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
  private readonly _initialization = new Array<Statement>();

  public readonly documentation = new Array<string>();
  public readonly initialization: ReadonlyArray<Statement> = this._initialization;

  /**
   * Create a module with a given FQN
   *
   * The FQN should just be unique, it does not need to correspond to a file
   * name (it helps for you own bookkeeping if it is useful though).
   *
   * All types defined in this module will have this FQN as a prefix of their
   * own FQN.
   */
  public constructor(fqn: string) {
    super(fqn);
  }

  /**
   * Whether this module has no types and no statements
   */
  public isEmpty(): boolean {
    return this.types.length === 0 && this.initialization.length === 0;
  }

  public get name(): string {
    return this.fqn;
  }

  public get importName() {
    return this.fqn;
  }

  /**
   * All interfaces in this module/namespace (not submodules)
   */
  public get interfaces(): readonly StructType[] {
    return this.types.filter((t) => t instanceof StructType).map((t) => t as StructType);
  }

  /**
   * Add an import of another module into the current module
   *
   * `ModuleImport` should be either a `SelectiveModuleImport` or an
   * `AliasedModuleImport`; symbols from the linked Module will automatically
   * become availabe in the current module.
   */
  public addImport(imp: ModuleImport) {
    this._imports.push(imp);
    imp.linkInto(this);
  }

  /**
   * Import the current module into the target module
   */
  public import(intoModule: Module, as: string, props: ModuleImportProps = {}) {
    intoModule.addImport(new AliasedModuleImport(this, props.fromLocation ?? this.importName, as));
  }

  /**
   * Import the current module into the target module with selective imports
   *
   * @param intoModule - The module to import into
   * @param names - Array of import names. Each element can be:
   *   - A string for regular imports: `'foo'` → `import { foo } from '...'`
   *   - A tuple for aliased imports: `['foo', 'bar']` → `import { foo as bar } from '...'`
   * @param props - Additional import properties
   * @returns The SelectiveModuleImport instance for further customization
   *
   * @example Regular and aliased imports
   * ```ts
   * source.importSelective(target, ['RegularImport', ['LongName', 'Short']]);
   * // Generates: import { RegularImport, LongName as Short } from "source";
   * ```
   *
   * @example Avoiding name conflicts
   * ```ts
   * reactModule.importSelective(myModule, [['Component', 'ReactComponent'], 'useState']);
   * // Generates: import { Component as ReactComponent, useState } from "react";
   * ```
   *
   * @example Dynamic imports using returned instance
   * ```ts
   * const imp = source.importSelective(target, ['existing']);
   * imp.addAliasedImport('foo', 'bar');
   * // Generates: import { existing, foo as bar } from "source";
   * ```
   */
  public importSelective(intoModule: Module, names: Array<string | [string, string]>, props: ModuleImportProps = {}) {
    const imp = new SelectiveModuleImport(this, props.fromLocation ?? this.importName, names);
    intoModule.addImport(imp);
    return imp;
  }

  /**
   * Add initialization statements
   *
   * These will be executed when the module loads
   */
  public addInitialization(...statements: Statement[]) {
    this._initialization.push(...statements);
  }

  /**
   * Return a reference to a type in this module
   *
   * The presence of the type is not checked.
   */
  public type(name: string): Type {
    return Type.fromName(this, name);
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
 * A selective import statement
 *
 * Import statements get rendered into the source module, and also count as scope linkage.
 * Supports both regular imports and aliased imports.
 *
 * @example Constructor with mixed imports
 * ```ts
 * new SelectiveModuleImport(module, 'source', ['foo', ['bar', 'baz']]);
 * // Generates: import { foo, bar as baz } from "source";
 * ```
 *
 * @example Adding imports dynamically
 * ```ts
 * const imp = new SelectiveModuleImport(module, 'source');
 * imp.addImportedName('foo');
 * imp.addAliasedImport('bar', 'baz');
 * // Generates: import { foo, bar as baz } from "source";
 * ```
 */
export class SelectiveModuleImport extends ModuleImport {
  public readonly importedNames: string[] = [];
  private readonly aliasMap = new Map<string, string>();
  private targetScope?: IScope;

  constructor(module: Module, moduleSource: string, importedNames: Array<string | [string, string]> = []) {
    super(module, moduleSource);

    for (const name of importedNames) {
      if (Array.isArray(name)) {
        this.addAliasedImport(name[0], name[1]);
      } else {
        this.addImportedName(name);
      }
    }
  }

  /**
   * Add a regular import name
   *
   * @param name - The name to import
   * @example
   * ```ts
   * imp.addImportedName('MyClass');
   * // Adds to: import { MyClass } from "...";
   * ```
   */
  public addImportedName(name: string) {
    this.importedNames.push(name);
    if (this.targetScope) {
      this.linkSymbol(name, name, this.targetScope);
    }
  }

  /**
   * Add an aliased import
   *
   * @param name - The original name in the source module
   * @param alias - The alias to use in the target module
   * @example
   * ```ts
   * imp.addAliasedImport('VeryLongClassName', 'Short');
   * // Adds to: import { VeryLongClassName as Short } from "...";
   * ```
   */
  public addAliasedImport(name: string, alias: string) {
    this.importedNames.push(name);
    this.aliasMap.set(name, alias);
    if (this.targetScope) {
      this.linkSymbol(name, alias, this.targetScope);
    }
  }

  /**
   * Get the alias for an imported name, if any
   * @param name - The original name
   * @returns The alias, or undefined if no alias exists
   */
  public getAlias(name: string): string | undefined {
    return this.aliasMap.get(name);
  }

  public linkInto(scope: IScope): void {
    for (const name of this.importedNames) {
      const alias = this.aliasMap.get(name) ?? name;
      this.linkSymbol(name, alias, scope);
    }
    this.targetScope = scope;
  }

  private linkSymbol(name: string, alias: string, scope: IScope) {
    scope.linkSymbol(new ThingSymbol(name, this.module), expr.ident(alias));
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
