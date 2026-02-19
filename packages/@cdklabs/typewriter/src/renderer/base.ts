import { IndentedStringBuilder } from './indented-string-builder';
import { FreeFunction } from '../callable';
import { ClassType } from '../class';
import { EnumType } from '../enum';
import { InterfaceType } from '../interface';
import { Module } from '../module';
import { MonkeyPatchedType } from '../monkey-patched-type';
import { IScope } from '../scope';
import { StructType } from '../struct';
import { DeclarationKind, TypeDeclaration } from '../type-declaration';

export interface RenderOptions {
  indentation?: number | string;
}

export abstract class Renderer {
  protected symbol: string;
  private emitter = new IndentedStringBuilder();

  /**
   * Stack of visible scopes during rendering, closest first
   */
  private scopeStack = new Array<IScope>();

  public constructor(options: RenderOptions = {}) {
    this.symbol = this.setIndentationSymbol(options.indentation);
  }

  /**
   * Render a module to a string.
   */
  public render(scope: Module): string {
    this.emitter = new IndentedStringBuilder();
    this.renderModule(scope);
    return this.emitter.toString();
  }

  /**
   * Render a module.
   */
  protected abstract renderModule(scope: Module): void;

  /**
   * Render types of a module.
   */
  protected renderModuleTypes(mod: Module): void {
    this.emitList(mod.types, '\n\n', (t) => this.renderDeclaration(t));
  }

  protected renderDeclaration(decl: TypeDeclaration) {
    switch (decl.kind) {
      case DeclarationKind.Struct:
        this.renderStruct(decl as StructType);
        break;
      case DeclarationKind.Interface:
        this.renderInterface(decl as InterfaceType);
        break;
      case DeclarationKind.Enum:
        this.renderEnum(decl as EnumType);
        break;
      case DeclarationKind.Function:
        this.renderFunction(decl as FreeFunction);
        break;
      case DeclarationKind.Class:
        this.renderClass(decl as ClassType);
        break;
      case DeclarationKind.MonkeyPatch:
        this.renderMonkeyPatch(decl as MonkeyPatchedType);
        break;
      default:
        throw `Unknown type: ${decl.kind} for ${decl.fqn}. Skipping.`;
    }
  }

  /**
   * Render an interface.
   */
  protected abstract renderStruct(interfaceType: StructType): void;

  /**
   * Render an interface.
   */
  protected abstract renderInterface(interfaceType: InterfaceType): void;

  /**
   * Render an enum.
   */
  protected abstract renderEnum(enumType: EnumType): void;

  /**
   * Render a callable.
   */
  protected abstract renderFunction(func: FreeFunction): void;

  /**
   * Render a class.
   */
  protected abstract renderClass(cls: ClassType): void;

  protected renderMonkeyPatch(mod: MonkeyPatchedType) {
    void mod;
    throw new Error(`${this} does not support monkey patches`);
  }

  protected indent() {
    this.emitter.indent(this.symbol);
  }

  protected unindent() {
    this.emitter.unindent();
  }

  protected emit(x: string) {
    this.emitter.emit(x);
  }

  protected setIndentationSymbol(symbol: number | string = 2): string {
    if (typeof symbol === 'number') {
      return ' '.repeat(symbol ?? 2);
    }

    return symbol;
  }

  protected emitList<A>(xs: Iterable<A>, sep: string, block: (x: A) => void) {
    let first = true;
    for (const x of xs) {
      if (!first) {
        this.emit(sep);
      }
      first = false;

      block(x);
    }
  }

  protected withScope(scope: IScope, block: () => void) {
    this.scopeStack.unshift(scope);
    try {
      block();
    } finally {
      this.scopeStack.shift();
    }
  }

  protected get scopes(): ReadonlyArray<IScope> {
    return this.scopeStack;
  }

  public toString() {
    return `${this.constructor.name} renderer`;
  }
}
