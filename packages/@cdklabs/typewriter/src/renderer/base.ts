import { Callable } from '../callable';
import { StructType } from '../struct';
import { Module } from '../module';
import { SymbolKind } from '../symbol';
import { Emitter } from './emitter';

export interface RenderOptions {
  indentation?: number | string;
}

export abstract class Renderer {
  protected symbol: string;
  private emitter = new Emitter();

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
    for (const t of mod.types) {
      switch (t.kind) {
        case SymbolKind.Interface:
          this.renderStruct(t as StructType);
          this.emit('\n\n');
          break;
        case SymbolKind.Function:
          this.renderCallable(t as Callable);
          this.emit('\n\n');
          break;
        default:
          throw `Unknown type: ${t.kind} for ${t.fqn}. Skipping.`;
      }
    }
  }

  /**
   * Render an interface.
   */
  protected abstract renderStruct(interfaceType: StructType): void;

  /**
   * Render a callable.
   */
  protected abstract renderCallable(func: Callable): void;

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
}
