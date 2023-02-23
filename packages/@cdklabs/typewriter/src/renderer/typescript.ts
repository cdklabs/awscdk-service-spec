import { Renderer } from './base';
import { InterfaceType } from '../interface';
import { Module } from '../module';
import { Property } from '../property';
import { TypeReference } from '../type-ref';
import { MemberVisibility } from '../type-member';

export class TypeScriptRenderer extends Renderer {
  protected renderModule(mod: Module, indentationLevel: number): string {
    return this.renderModuleTypes(mod, indentationLevel).join('\n\n');
  }

  protected renderInterface(interfaceType: InterfaceType, indentationLevel: number): string {
    const modifiers = interfaceType.modifiers.length ? interfaceType.modifiers.join(' ') + ' ' : '';

    return [
      this.indent(`${modifiers}interface ${interfaceType.name} {`, indentationLevel),
      Array.from(interfaceType.properties.values())
        .filter((p) => p.visibility === MemberVisibility.Public)
        .map((p) => this.renderProperty(p, indentationLevel + 1))
        .join('\n\n'),
      this.indent('}\n', indentationLevel),
    ].join('\n');
  }

  protected renderProperty(property: Property, level = 0): string {
    return this.indent(
      `${property.spec.immutable ? 'readonly ' : ''}${property.name}: ${this.renderTypeRef(property.type)};`,
      level,
    );
  }

  protected renderTypeRef(ref: TypeReference): string {
    if (ref.void) {
      return 'void';
    }
    if (ref.primitive) {
      return ref.primitive;
    }
    if (ref.fqn) {
      return ref.scope.findType(ref.fqn).name;
    }

    if (ref.arrayOfType) {
      return `Array<${this.renderTypeRef(ref.arrayOfType)}>`;
    }
    if (ref.mapOfType) {
      return `Map<string, ${this.renderTypeRef(ref.mapOfType)}>`;
    }
    if (ref.unionOfTypes) {
      return ref.unionOfTypes.map((x) => this.renderTypeRef(x)).join(' | ');
    }

    return 'any';
  }
}
