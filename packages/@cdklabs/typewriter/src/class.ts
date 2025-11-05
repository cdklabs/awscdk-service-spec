import { Expression, NewExpression, ObjectPropertyAccess } from './expressions';
import * as expr from './expressions/builder';
import { MemberType } from './member-type';
import { Module } from './module';
import { PropertySpec } from './property';
import { IScope, IScopeLink, ScopeImpl } from './scope';
import { ThingSymbol } from './symbol';
import { Type } from './type';
import { DeclarationKind, TypeDeclaration, TypeSpec } from './type-declaration';
import { Initializer, InitializerSpec, MethodSpec } from './type-member';

export interface ClassSpec extends TypeSpec {
  properties?: PropertySpec[];
  methods?: MethodSpec[];
  abstract?: boolean;
  extends?: Type;
  implements?: Type[];
}

export class ClassType extends MemberType implements IScope {
  public readonly kind = DeclarationKind.Class;
  private readonly classScope: ScopeImpl;

  public readonly nestedDeclarations: TypeDeclaration[] = [];

  /**
   * List the modifiers of the interface
   */
  public get modifiers(): Array<string> {
    const modifiers = [];

    if (this.spec.export) {
      modifiers.push('export');
    }
    if (this.spec.abstract) {
      modifiers.push('abstract');
    }
    return modifiers;
  }

  private _initializer?: Initializer;

  private registeredInParentScope = false;

  public constructor(public scope: IScope, public readonly spec: ClassSpec) {
    super(scope, spec);
    this.classScope = new ScopeImpl(this.fqn);
    spec.properties?.forEach((p) => this.addProperty(p));
    spec.methods?.forEach((m) => this.addMethod(m));
  }

  public get initializer() {
    return this._initializer;
  }

  public get extends() {
    return this.spec.extends;
  }

  public get implements() {
    return this.spec.implements ?? [];
  }

  public addInitializer(spec: InitializerSpec) {
    if (this._initializer) {
      throw new Error(`Class ${this.name} already has an initializer`);
    }
    this._initializer = new Initializer(this, spec);
    return this._initializer;
  }

  public newInstance(...args: Expression[]) {
    return new NewExpression(this.type, ...args);
  }

  /**
   * Update some of the fields of the class spec, except fields that are immutable or managed elsewhere.
   *
   * Members are managed via specific method calls.
   */
  public update<A extends Omit<Partial<ClassSpec>, 'properties' | 'methods' | 'name'>>(updates: A) {
    Object.assign(this.spec, updates);
  }

  //////////////////////////////////////////////////////////////////////
  // IScope

  public get typeMap() {
    return this.classScope.typeMap;
  }

  public qualifyName(name: string): string {
    return this.classScope.qualifyName(name);
  }

  registerType(type: TypeDeclaration): void {
    if (type.kind === DeclarationKind.Function) {
      throw new Error(`Cannot create free function ${type} in scope of ${this}. Add a static method instead.`);
    }

    this.classScope.registerType(type);

    this.nestedDeclarations.push(type);

    // If we have nested types, be sure to register this class' scope in the containing module scope
    if (!this.registeredInParentScope) {
      this.registeredInParentScope = true;
      Module.of(this).linkScope(this, {
        referenceSymbol: (sym) => new ObjectPropertyAccess(expr.sym(this.symbol), sym.name),
      });
    }
  }

  tryFindType(fqn: string): TypeDeclaration | undefined {
    return this.classScope.tryFindType(fqn);
  }

  linkScope(scope: IScope, theImport: IScopeLink): void {
    return this.classScope.linkScope(scope, theImport);
  }

  linkSymbol(sym: ThingSymbol, exp: Expression): void {
    return this.classScope.linkSymbol(sym, exp);
  }

  symbolToExpression(symbol: ThingSymbol): Expression | undefined {
    return this.classScope.symbolToExpression(symbol);
  }
}
