import { Renderer } from './base';
import { Callable } from '../callable';
import { StructType } from '../struct';
import { Module } from '../module';
import { Property } from '../property';
import {
  ObjectPropertyAccess,
  ObjectLiteral,
  ReturnStatement,
  Statement,
  LocalSymbol,
  ObjectMethodInvoke,
  ObjectReference,
  ExpressionStatement,
} from '../statements';
import { MemberVisibility } from '../type-member';
import { TypeReference } from '../type-ref';
import { Documented } from '../documented';
import { Expression } from '../expression';
import { InvokeCallable } from '../expressions/invoke';

export class TypeScriptRenderer extends Renderer {
  protected renderModule(mod: Module, lvl: number): string {
    return [this.renderImports(mod), this.renderModuleTypes(mod, lvl).join('\n\n')].join('\n\n');
  }

  protected renderImports(mod: Module): string {
    return mod.imports.map(([name, scope]) => `import * as ${name} from "${scope.fqn}";`).join('\n');
  }

  protected renderStruct(structType: StructType, lvl: number): string {
    const modifiers = structType.modifiers.length ? structType.modifiers.join(' ') + ' ' : '';

    return [
      ...this.indent(this.renderDocs(structType, { forceStruct: true }), lvl),
      this.indent(`${modifiers}interface ${structType.name} {`, lvl),
      Array.from(structType.properties.values())
        .filter((p) => p.visibility === MemberVisibility.Public)
        .map((p) => this.renderProperty(p, lvl + 1))
        .join('\n\n'),
      this.indent('}\n', lvl),
    ].join('\n');
  }

  protected renderProperty(property: Property, level = 0): string {
    return [
      ...this.indent(this.renderDocs(property), level),
      this.indent(
        `${property.spec.immutable ? 'readonly ' : ''}${property.name}: ${this.renderTypeRef(property.type)};`,
        level,
      ),
    ].join('\n');
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
      ...this.indent(this.renderDocs(func), lvl),
      this.indent(`// @ts-ignore TS6133`, lvl),
      this.indent(`function ${func.name}(${params})${returnType} {`, lvl),
      // We already have the curlies
      ...func.body.statements.map((s) => this.renderStatement(s, lvl + 1)),
      this.indent('}\n', lvl),
    ].join('\n');
  }

  protected renderStatement(stmnt: Statement, lvl: number): string {
    if (stmnt instanceof ReturnStatement) {
      return this.renderReturnStatement(stmnt, lvl);
    }
    if (stmnt instanceof ExpressionStatement) {
      return this.renderExpression(stmnt.expression, lvl);
    }

    return `/* @todo ${stmnt.constructor.name} */`;
  }

  protected renderExpression(stmnt: Expression, lvl: number): string {
    if (stmnt instanceof ObjectLiteral) {
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
    const argList = args.map((arg) => this.renderExpression(arg, lvl));
    return this.indent(`${name}(${argList.join(', ').trim()})`, lvl);
  }

  protected renderObjectLiteral(obj: ObjectLiteral, lvl: number) {
    return [
      this.indent('{', lvl),
      obj.entries
        .map(([key, val]) =>
          this.indent(`${JSON.stringify(key)}: ${this.renderExpression(val, lvl + 1).trim()},`, lvl + 1),
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

  protected renderReturnStatement(ret: ReturnStatement, lvl: number) {
    if (!ret.expression) {
      return this.indent('return;', lvl);
    }

    return this.indent(`return ${this.renderExpression(ret.expression, lvl).trim()};`, lvl);
  }

  protected renderDocs(el: Documented, options: DocOptions = {}): string[] {
    const ret = new Array();
    line(el.docs?.summary);
    parBreak();
    line(el.docs?.remarks);
    parBreak();
    if (options?.forceStruct) {
      line('@struct');
    }
    tagged('deprecated', el.docs?.deprecated);
    tagged('stability', el.docs?.stability);
    tagged('default -', el.docs?.default);
    tagged('returns', el.docs?.returns);
    tagged('example', `\n${el.docs?.example ?? ''}`);

    while (ret.length > 0 && ret[ret.length - 1] === '') {
      ret.pop();
    }

    if (ret.length === 0) {
      return [];
    }

    return ['/**', ...ret.map((x) => ` * ${x.trimEnd()}`), ' */'];

    function line(x: string | undefined) {
      if (x?.trim()) {
        ret.push(...x.split('\n'));
      }
    }

    function tagged(tag: string, x: string | undefined) {
      if (x?.trim()) {
        ret.push(...`@${tag} ${x}`.split('\n'));
      }
    }

    function parBreak() {
      if (ret.length > 0) {
        ret.push('');
      }
    }
  }
}

export interface DocOptions {
  /**
   * Emit an annotation that forces jsii to recognize this type as a struct
   */
  readonly forceStruct?: boolean;
}
