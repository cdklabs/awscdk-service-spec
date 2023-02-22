import { Renderer } from './base';
import { InterfaceType } from '../interface';
import { Module } from '../module';
import { Property } from '../property';

export class TypeScriptRenderer extends Renderer {
  protected renderModule(mod: Module, indentationLevel: number): string {
    return this.renderModuleTypes(mod, indentationLevel).join('\n\n');
  }

  protected renderInterface(interfaceType: InterfaceType, indentationLevel: number): string {
    const modifiers = interfaceType.modifiers.length ? interfaceType.modifiers.join(' ') + ' ' : '';

    return [
      this.indent(`${modifiers}interface ${interfaceType.name} {`, indentationLevel),
      Array.from(interfaceType.properties.values())
        .map((p) => this.renderProperty(p, indentationLevel + 1))
        .join('\n\n'),
      this.indent('}\n', indentationLevel),
    ].join('\n');
  }

  protected renderProperty(property: Property, level = 0): string {
    return this.indent(`${property.spec.immutable ? 'readonly ' : ''}${property.name}: ${property.type};`, level);
  }

  // renderRef(_renderer: Renderer, _indentationLevel: number): string {
  //   return this.toString();
  // }
}
