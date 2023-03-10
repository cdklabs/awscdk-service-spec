import { FreeFunction } from '../callable';
import { StructType } from '../struct';
import { Module } from '../module';
import { SymbolKind } from '../symbol';
import { Emitter } from './emitter';
import { ClassType } from '../class';
import { InterfaceType } from '../interface';
import { Scope } from '../scope';

export interface RenderOptions {
  indentation?: number | string;
}

export abstract class Renderer {
  protected symbol: string;
  private emitter = new Emitter();

  /**
   * Stack of visible scopes during rendering, closest first
   */
  private scopeStack = new Array<Scope>();

  public constructor(options: RenderOptions = {}) {
    this.symbol = this.setIndentationSymbol(options.indentation);
  }

  /**
   * Render a renderable to a string.
   */
  public render(scope: Module): string {
    this.emitter = new Emitter();
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
    this.emitList(mod.types, '\n\n', (t) => {
      switch (t.kind) {
        case SymbolKind.Struct:
          this.renderStruct(t as StructType);
          break;
        case SymbolKind.Interface:
          this.renderInterface(t as InterfaceType);
          break;
        case SymbolKind.Function:
          this.renderFunction(t as FreeFunction);
          break;
        case SymbolKind.Class:
          this.renderClass(t as ClassType);
          break;
        default:
          throw `Unknown type: ${t.kind} for ${t.fqn}. Skipping.`;
      }
    });
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
   * Render a callable.
   */
  protected abstract renderFunction(func: FreeFunction): void;

  /**
   * Render a class.
   */
  protected abstract renderClass(cls: ClassType): void;

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

  protected withScope(scope: Scope, block: () => void) {
    this.scopeStack.unshift(scope);
    try {
      block();
    } finally {
      this.scopeStack.shift();
    }
  }

  protected get scopes(): ReadonlyArray<Scope> {
    return this.scopeStack;
  }
}
