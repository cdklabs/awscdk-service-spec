import { Callable } from '../callable';
import { StructType } from '../struct';
import { Module } from '../module';
import { TypeKind } from '../type-declaration';

export interface RenderOptions {
  indentation?: number | string;
}

export abstract class Renderer {
  protected symbol: string;

  public constructor(options: RenderOptions = {}) {
    this.symbol = this.setIndentationSymbol(options.indentation);
  }

  /**
   * Render a renderable to a string.
   */
  public render(scope: Module): string {
    return this.renderModule(scope, 0);
  }

  /**
   * Render a module.
   */
  protected abstract renderModule(scope: Module, indentationLevel: number): string;

  /**
   * Render types of a module.
   */
  protected renderModuleTypes(mod: Module, indentationLevel: number): string[] {
    return mod.types.map((t) => {
      switch (t.kind) {
        case TypeKind.Interface:
          return this.renderStruct(t as StructType, indentationLevel);
        case TypeKind.Function:
          return this.renderCallable(t as Callable, indentationLevel);
        default:
          throw `Unknown type: ${t.kind} for ${t.fqn}. Skipping.`;
      }
    });
  }

  /**
   * Render an interface.
   */
  protected abstract renderStruct(interfaceType: StructType, indentationLevel: number): string;

  /**
   * Render a callable.
   */
  protected abstract renderCallable(func: Callable, indentationLevel: number): string;

  /**
   * Indent text to the specified level.
   */
  public indent(text: string[], level: number): string[];
  public indent(text: string, level: number): string;
  public indent(text: string | string[], level: number): string | string[] {
    return Array.isArray(text) ? text.map((t) => this.getIndentation(level) + t) : this.getIndentation(level) + text;
  }

  protected setIndentationSymbol(symbol: number | string = 2): string {
    if (typeof symbol === 'number') {
      return ' '.repeat(symbol ?? 2);
    }

    return symbol;
  }

  protected getIndentation(level: number): string {
    return this.symbol.repeat(level);
  }
}
