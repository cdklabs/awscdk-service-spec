import { Renderer } from './base';
import { Callable } from '../callable';
import { StructType } from '../struct';
import { Module } from '../module';
import { Property } from '../property';
import { ReturnStatement, Statement, ExpressionStatement, IfThenElse, Block } from '../statements';
import { MemberVisibility } from '../type-member';
import { Type } from '../type';
import { Documented } from '../documented';
import { Expression } from '../expression';
import { InvokeCallable } from '../expressions/invoke';
import { Identifier, ObjectLiteral, ObjectMethodInvoke, ObjectPropertyAccess, ObjectReference } from '../expressions';

export class TypeScriptRenderer extends Renderer {
  protected renderModule(mod: Module) {
    this.renderImports(mod);
    this.renderModuleTypes(mod);
  }

  protected renderImports(mod: Module) {
    for (const [name, scope] of mod.imports) {
      this.emit(`import * as ${name} from "${scope.fqn}";\n`);
    }
  }

  protected emitBlock(header: string, block: () => void) {
    this.indent();
    this.emit(header);
    this.emit('{\n');
    block();
    this.unindent();
    this.emit('\n}');
  }

  protected emitList<A>(xs: A[], sep: string, block: (x: A) => void) {
    let first = true;
    for (const x of xs) {
      if (!first) {
        this.emit(sep);
      }
      first = false;

      block(x);
    }
  }

  protected renderStruct(structType: StructType) {
    const modifiers = structType.modifiers.length ? structType.modifiers.join(' ') + ' ' : '';

    this.renderDocs(structType, { forceStruct: true });
    this.emitBlock(`${modifiers}interface ${structType.name}`, () => {
      const props = Array.from(structType.properties.values()).filter((p) => p.visibility === MemberVisibility.Public);

      this.emitList(props, '\n\n', (p) => this.renderProperty(p));
    });
  }

  protected renderProperty(property: Property) {
    this.renderDocs(property);

    const qmark = property.optional ? '?' : '';
    this.emit(`${property.spec.immutable ? 'readonly ' : ''}${property.name}${qmark}: `);
    this.renderTypeRef(property.type);
    this.emit(';');
  }

  protected renderTypeRef(ref: Type): void {
    if (ref.void) {
      return this.emit('void');
    }
    if (ref.primitive) {
      return this.emit(ref.primitive);
    }
    if (ref.fqn) {
      return this.emit(ref.scope.findType(ref.fqn).name);
    }

    if (ref.arrayOfType) {
      this.emit(`Array<`);
      this.renderTypeRef(ref.arrayOfType);
      this.emit('>');
      return;
    }
    if (ref.mapOfType) {
      this.emit(`Map<string, `);
      this.renderTypeRef(ref.mapOfType);
      this.emit('>');
      return;
    }
    if (ref.unionOfTypes) {
      return this.emitList(ref.unionOfTypes, ' | ', (x) => this.renderTypeRef(x));
    }

    this.emit('any');
  }

  protected renderCallable(func: Callable) {
    this.renderDocs(func);
    this.emit(`// @ts-ignore TS6133\n`);

    const params = func.parameters.map((p) => `${p.name}: ${this.renderTypeRef(p.type)}`).join(', ');
    const returnType = func.returnType ? `: ${this.renderTypeRef(func.returnType)}` : '';
    this.emit(`function ${func.name}(${params})${returnType} `);
    this.renderBlock(func.body);
  }

  protected renderStatement(stmnt: Statement) {
    if (stmnt instanceof ReturnStatement) {
      return this.renderReturnStatement(stmnt);
    }
    if (stmnt instanceof ExpressionStatement) {
      return this.renderExpression(stmnt.expression);
    }
    if (stmnt instanceof IfThenElse) {
      return this.renderIfThenElse(stmnt);
    }
    if (stmnt instanceof Block) {
      return this.renderBlock(stmnt);
    }

    this.emit(`/* @todo ${stmnt.constructor.name} */`);
  }

  protected renderExpression(stmnt: Expression): void {
    if (stmnt instanceof ObjectLiteral) {
      return this.renderObjectLiteral(stmnt);
    } else if (stmnt instanceof ObjectPropertyAccess) {
      return this.renderObjectAccess(stmnt.obj, stmnt.property);
    } else if (stmnt instanceof ObjectMethodInvoke) {
      return this.renderObjectMethodInvoke(stmnt);
    } else if (stmnt instanceof InvokeCallable) {
      return this.renderInvokeCallable(stmnt);
    } else if (stmnt instanceof Identifier) {
      return this.renderIdentifier(stmnt);
    }

    this.emit(`/* @todo ${stmnt.constructor.name} */`);
  }

  protected renderIdentifier(id: Identifier) {
    this.emit(id.name);
  }

  protected renderObjectMethodInvoke(omi: ObjectMethodInvoke) {
    this.renderObjectAccess(omi.obj, omi.method);
    this.emit('(');
    this.emitList(omi.args, ', ', (arg) => this.renderExpression(arg));
    this.emit(')');
  }

  protected renderInvokeCallable(ic: InvokeCallable) {
    this.renderExpression(ic.callable);
    this.emit('(');
    this.emitList(ic.args, ', ', (arg) => this.renderExpression(arg));
    this.emit(')');
  }

  protected renderBlock(obj: Block) {
    this.emitBlock('', () => {
      this.emitList(obj.statements, '\n', (s) => this.renderStatement(s));
    });
  }

  protected renderObjectLiteral(obj: ObjectLiteral) {
    this.emitBlock('', () => {
      this.emitList(obj.entries, ',\n', ([key, val]) => {
        this.emit(`${JSON.stringify(key)}: `);
        this.renderExpression(val);
      });
    });
  }

  protected renderObjectAccess(obj: ObjectLiteral | ObjectReference, member: string) {
    if (obj instanceof ObjectLiteral) {
      this.emit('(');
      this.renderObjectLiteral(obj);
      this.emit(').');
      this.emit(member);
      return;
    }

    this.renderExpression(obj.symbol);
    this.emit('.');
    this.emit(member);
  }

  protected renderReturnStatement(ret: ReturnStatement) {
    if (!ret.expression) {
      return this.emit('return;');
    }

    this.emit(`return `);
    this.renderExpression(ret.expression);
    this.emit(';');
  }

  protected renderIfThenElse(ifThen: IfThenElse) {
    this.emit('if (');
    this.renderExpression(ifThen.condition);
    this.emit(') ');

    this.renderStatement(ifThen.thenStatement ?? new Block());
    if (ifThen.elseStatement) {
      this.emit(' else');
      this.renderStatement(ifThen.elseStatement);
    }
  }

  protected renderDocs(el: Documented, options: DocOptions = {}): void {
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
    tagged('see', el.docs?.see);
    tagged('example', `\n${el.docs?.example ?? ''}`);

    while (ret.length > 0 && ret[ret.length - 1] === '') {
      ret.pop();
    }

    if (ret.length === 0) {
      return;
    }

    this.emit('/**\n');
    for (const x of ret) {
      this.emit(` * ${x.trimEnd()}\n`);
    }
    this.emit(' */\n');

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
      if (ret.length > 0 && ret[ret.length - 1] !== '') {
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
