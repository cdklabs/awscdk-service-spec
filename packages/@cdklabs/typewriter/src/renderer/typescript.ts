import { Renderer } from './base';
import { Callable } from '../callable';
import { InterfaceType } from '../interface';
import { Module } from '../module';
import { Property } from '../property';
import {
  ObjectPropertyAccess,
  ObjectLiteral,
  ReturnStatement as ReturnExpression,
  Statement,
  LocalSymbol,
  InvokeCallable,
  ObjectMethodInvoke,
  ObjectReference,
} from '../statements';
import { MemberVisibility } from '../type-member';
import { TypeReference } from '../type-ref';

export class TypeScriptRenderer extends Renderer {
  protected renderModule(mod: Module, lvl: number): string {
    return [this.renderImports(mod), this.renderModuleTypes(mod, lvl).join('\n\n')].join('\n\n');
  }

  protected renderImports(mod: Module): string {
    return mod.imports.map(([name, scope]) => `import * as ${name} from "${scope.fqn}";`).join('\n');
  }

  protected renderInterface(interfaceType: InterfaceType, lvl: number): string {
    const modifiers = interfaceType.modifiers.length ? interfaceType.modifiers.join(' ') + ' ' : '';

    return [
      this.indent(`${modifiers}interface ${interfaceType.name} {`, lvl),
      Array.from(interfaceType.properties.values())
        .filter((p) => p.visibility === MemberVisibility.Public)
        .map((p) => this.renderProperty(p, lvl + 1))
        .join('\n\n'),
      this.indent('}\n', lvl),
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

  protected renderCallable(func: Callable, lvl: number): string {
    const params = func.parameters.map((p) => `${p.name}: ${this.renderTypeRef(p.type)}`).join(', ');
    const returnType = func.returnType ? `: ${this.renderTypeRef(func.returnType)}` : '';
    return [
      this.indent(`// @ts-ignore TS6133`, lvl),
      this.indent(`function ${func.name}(${params})${returnType} {`, lvl),
      ...func.body.map((s) => this.renderStatement(s, lvl + 1)),
      this.indent('}\n', lvl),
    ].join('\n');
  }

  protected renderStatement(stmnt: Statement, lvl: number): string {
    if (stmnt instanceof ReturnExpression) {
      return this.renderReturnStatement(stmnt, lvl);
    } else if (stmnt instanceof ObjectLiteral) {
      return this.renderObjectLiteral(stmnt, lvl);
    } else if (stmnt instanceof ObjectPropertyAccess) {
      return this.renderObjectAccess(stmnt.obj, stmnt.property, lvl);
    } else if (stmnt instanceof ObjectMethodInvoke) {
      return this.renderInvokeCallable(`${this.renderObjectAccess(stmnt.obj, stmnt.method, lvl)}`, stmnt.args, lvl);
    } else if (stmnt instanceof InvokeCallable) {
      return this.renderInvokeCallable(stmnt.callable.name, stmnt.args, lvl);
    }

    return `/* @todo ${stmnt.constructor.name} */`;
  }

  protected renderInvokeCallable(name: string, args: Statement[], lvl: number): string {
    const argList = args.map((arg) => this.renderStatement(arg, lvl));
    return this.indent(`${name}(${argList.join(', ').trim()})`, lvl);
  }

  protected renderObjectLiteral(obj: ObjectLiteral, lvl: number) {
    return [
      this.indent('{', lvl),
      obj.entries
        .map(([key, val]) =>
          this.indent(`${JSON.stringify(key)}: ${this.renderStatement(val, lvl + 1).trim()},`, lvl + 1),
        )
        .join('\n'),
      this.indent('}', lvl),
    ].join('\n');
  }

  protected renderObjectAccess(obj: ObjectLiteral | ObjectReference, member: string, lvl: number): string {
    if (obj instanceof ObjectLiteral) {
      return this.indent(`(${this.renderObjectLiteral(obj, lvl)}).${member}`, lvl);
    }
    return this.indent(`${this.renderSymbol(obj.symbol)}.${member}`, lvl);
  }

  protected renderSymbol(symbol: LocalSymbol): string {
    return symbol.name;
  }

  protected renderReturnStatement(ret: ReturnExpression, lvl: number) {
    if (!ret.statement) {
      return this.indent('return;', lvl);
    }

    return this.indent(`return ${this.renderStatement(ret.statement, lvl).trim()};`, lvl);
  }
}
