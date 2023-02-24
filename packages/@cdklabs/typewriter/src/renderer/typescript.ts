import { Renderer } from './base';
import { InterfaceType } from '../interface';
import { Module } from '../module';
import { Property } from '../property';
import {
  Callable,
  ObjectAccessStatement,
  ObjectLiteral,
  ReturnStatement as ReturnExpression,
  Statement,
  Symbol,
} from '../statements';
import { MemberVisibility } from '../type-member';
import { TypeReference } from '../type-ref';

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

  renderFunction(func: Callable, indentationLevel: number): string {
    const params = func.parameters.map((p) => `${p.name}: ${this.renderTypeRef(p.type)}`).join(', ');
    const returnType = func.returnType ? `: ${this.renderTypeRef(func.returnType)}` : '';
    return [
      this.indent(`function ${func.name}(${params})${returnType} {`, indentationLevel),
      ...func.body.map((s) => this.renderStatement(s, indentationLevel + 1)),
      this.indent('}\n', indentationLevel),
    ].join('\n');
  }

  renderStatement(stmnt: Statement, lvl: number): string {
    if (stmnt instanceof ReturnExpression) {
      return this.renderReturnStatement(stmnt, lvl);
    } else if (stmnt instanceof ObjectLiteral) {
      return this.renderObjectLiteral(stmnt, lvl);
    } else if (stmnt instanceof ObjectAccessStatement) {
      return this.renderObjectAccessStatement(stmnt, lvl);
    }

    return '/* todo */';
  }

  renderObjectLiteral(obj: ObjectLiteral, lvl: number) {
    return [
      this.indent('{', lvl),
      obj.entries
        .map(([key, val]) => this.indent(`${JSON.stringify(key)}: ${this.renderStatement(val, lvl + 1)},`, lvl + 1))
        .join('\n'),
      this.indent('}', lvl),
    ].join('\n');
  }

  renderObjectAccessStatement({ object, property }: ObjectAccessStatement, lvl: number) {
    if (object instanceof ObjectLiteral) {
      return this.indent(`(${this.renderObjectLiteral(object, lvl)}).${property}`, lvl);
    }
    return this.indent(`${this.renderSymbol(object)}.${property}`, lvl);
  }

  renderSymbol(symbol: Symbol): string {
    return symbol.name;
  }

  renderReturnStatement(ret: ReturnExpression, lvl: number) {
    if (!ret.statement) {
      return this.indent('return;', lvl);
    }

    return this.indent(`return ${this.renderStatement(ret.statement, lvl).trim()};`, lvl);
  }
}
