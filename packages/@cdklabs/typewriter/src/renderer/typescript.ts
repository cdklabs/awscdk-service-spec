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
import {
  Identifier,
  NotExpression,
  ObjectLiteral,
  ObjectMethodInvoke,
  ObjectPropertyAccess,
  ObjectReference,
} from '../expressions';

export class TypeScriptRenderer extends Renderer {
  protected renderModule(mod: Module) {
    this.renderImports(mod);
    this.renderModuleTypes(mod);
  }

  protected renderImports(mod: Module) {
    for (const [name, scope] of mod.imports) {
      this.emit(`import * as ${name} from "${scope.fqn}";\n`);
    }

    if (mod.imports.length > 0) {
      this.emit('\n');
    }
  }

  protected emitBlock(header: string, block: () => void) {
    this.indent();
    this.emit(header);
    if (header) {
      this.emit(' {\n');
    } else {
      this.emit('{\n');
    }
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
    if (ref.isVoid) {
      return this.emit('void');
    }
    if (ref.primitive) {
      return this.emit(ref.primitive);
    }
    const decl = ref.declaration;
    if (decl) {
      return this.emit(decl.name);
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

    this.emit(`function ${func.name}(`);
    this.emitList(func.parameters, ', ', (p) => {
      this.emit(`${p.name}: `);
      this.renderTypeRef(p.type);
    });
    this.emit(')');
    if (func.returnType) {
      this.emit(': ');
      this.renderTypeRef(func.returnType);
    }

    this.emit(' ');
    this.renderBlock(func.body);
  }

  protected renderStatement(stmnt: Statement) {
    // FIXME: Comments
    const success = dispatchType(stmnt, [
      typeCase(ReturnStatement, (x) => this.renderReturnStatement(x)),
      typeCase(ExpressionStatement, (x) => this.renderExpression(x.expression)),
      typeCase(IfThenElse, (x) => this.renderIfThenElse(x)),
      typeCase(Block, (x) => this.renderBlock(x)),
    ]);

    if (!success) {
      this.emit(`/* @todo ${stmnt.constructor.name} */`);
    }
  }

  protected renderExpression(expr: Expression): void {
    const success = dispatchType(expr, [
      typeCase(ObjectLiteral, (x) => this.renderObjectLiteral(x)),
      typeCase(ObjectPropertyAccess, (x) => this.renderObjectAccess(x)),
      typeCase(ObjectMethodInvoke, (x) => this.renderObjectMethodInvoke(x)),
      typeCase(InvokeCallable, (x) => this.renderInvokeCallable(x)),
      typeCase(Identifier, (x) => this.renderIdentifier(x)),
      typeCase(ObjectReference, (x) => this.renderExpression(x.symbol)),
      typeCase(NotExpression, (x) => {
        this.emit('!');
        this.renderExpression(x.operand);
      }),
    ]);

    if (!success) {
      this.emit(`/* @todo ${expr.constructor.name} */`);
    }
  }

  protected renderIdentifier(id: Identifier) {
    this.emit(id.name);
  }

  protected renderObjectMethodInvoke(omi: ObjectMethodInvoke) {
    // FIXME: Simplify
    this.renderObjectAccess(new ObjectPropertyAccess(omi.obj, omi.method));
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

  protected renderObjectAccess(access: ObjectPropertyAccess) {
    // FIXME: Simplify
    if (access.obj instanceof ObjectLiteral) {
      this.emit('(');
      this.renderObjectLiteral(access.obj);
      this.emit(').');
      this.emit(access.property);
      return;
    }
    if (access.obj instanceof ObjectReference) {
      this.renderExpression(access.obj.symbol);
    } else {
      this.renderExpression(access.obj);
    }
    this.emit('.');
    this.emit(access.property);
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

type TypeCase<A> = { ctr: new (...args: any[]) => A; then: (x: A) => void };

function dispatchType<A extends object>(x: A, cases: Array<TypeCase<any>>): boolean {
  for (const { ctr, then } of cases) {
    if (x instanceof ctr) {
      then(x);
      return true;
    }
  }
  return false;
}

function typeCase<A extends object>(ctr: TypeCase<A>['ctr'], then: TypeCase<A>['then']): TypeCase<A> {
  return { ctr, then };
}
