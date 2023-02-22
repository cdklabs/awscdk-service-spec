import * as jsii from '@jsii/spec';
import { InterfaceType } from '../interface';
import { Module } from '../module';

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
        case jsii.TypeKind.Interface:
          return this.renderInterface(t as InterfaceType, indentationLevel);
        default:
          throw `Unknown type: ${t.kind}`;
      }
    });
  }

  /**
   * Render an interface.
   */
  protected abstract renderInterface(interfaceType: InterfaceType, indentationLevel: number): string;

  /**
   * Indent text to the specified level.
   */
  public indent(text: string, level: number): string {
    return this.getIndentation(level) + text;
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
