import { Renderer } from './base';
import { CallableDeclaration, isCallableDeclaration } from '../callable';
import { ClassType } from '../class';
import { Documented } from '../documented';
import { Expression, SymbolReference } from '../expression';
import {
  BinOp,
  DestructuringBind,
  Identifier,
  IsNotNullish,
  IsObject,
  JsLiteralExpression,
  NewExpression,
  NotExpression,
  Null,
  ObjectLiteral,
  ObjectMethodInvoke,
  ObjectPropertyAccess,
  StrConcat,
  Structure,
  Ternary,
  ThisInstance,
  TruthyOr,
  Undefined,
} from '../expressions';
import { InvokeCallable } from '../expressions/invoke';
import { InterfaceType } from '../interface';
import { AliasedModuleImport, Module } from '../module';
import { Property } from '../property';
import {
  ReturnStatement,
  Statement,
  ExpressionStatement,
  IfThenElse,
  Block,
  AssignmentStatement,
  VariableDeclaration,
  Mut,
  SuperInitializer,
  ForLoop,
  StatementSeparator,
  ThrowStatement,
} from '../statements';
import { StructType } from '../struct';
import { ThingSymbol } from '../symbol';
import { Type } from '../type';
import { Initializer, MemberVisibility, Method } from '../type-member';

export class TypeScriptRenderer extends Renderer {
  protected renderModule(mod: Module) {
    this.withScope(mod, () => {
      this.emit('/* eslint-disable prettier/prettier */\n');
      this.renderImports(mod);
      this.renderModuleTypes(mod);
    });
  }

  protected renderImports(mod: Module) {
    for (const imp of mod.imports) {
      if (imp instanceof AliasedModuleImport) {
        this.emit(`import * as ${imp.importAlias} from "${imp.moduleSource}";\n`);
      } else {
        this.emit('/* @todo multi import */\n');
      }
    }

    if (mod.imports.length > 0) {
      this.emit('\n');
    }
  }

  protected emitBlock(header: string, block: () => void) {
    this.indent();
    this.emit(header);
    if (header.trim()) {
      this.emit(' {\n');
    } else {
      this.emit('{\n');
    }
    block();
    this.unindent();
    this.emit('\n}');
  }

  protected renderStruct(structType: StructType) {
    const modifiers = structType.modifiers.length ? structType.modifiers.join(' ') + ' ' : '';

    this.renderDocs(structType, { forceStruct: true });
    this.emitBlock(`${modifiers}interface ${structType.name}`, () => {
      const props = Array.from(structType.properties.values()).filter((p) => p.visibility === MemberVisibility.Public);

      this.emitList(props, '\n\n', (p) => this.renderProperty(p, 'interface'));
    });
  }

  protected renderClass(classType: ClassType) {
    const modifiers = classType.modifiers.length ? classType.modifiers.join(' ') + ' ' : '';

    this.renderDocs(classType);
    this.emit(`${modifiers}class ${classType.name}`);

    if (classType.extends) {
      this.emit(' extends ');
      this.renderType(classType.extends);
    }
    if (classType.implements.length > 0) {
      this.emit(' implements ');
      this.emitList(classType.implements, ', ', (t) => this.renderType(t));
    }

    this.emitBlock(' ', () => {
      const members = [
        ...classType.properties.filter((p) => p.static),
        ...classType.methods.filter((p) => p.static),
        ...classType.properties.filter((p) => !p.static && !p.isGetterSetter),
        ...(classType.initializer ? [classType.initializer] : []),
        ...classType.properties.filter((p) => !p.static && p.isGetterSetter),
        ...classType.methods.filter((p) => !p.static),
      ];

      this.emitList(members, '\n\n', (m) =>
        m instanceof Property ? this.renderProperty(m, 'class') : this.renderMethod(m, 'class'),
      );
    });

    // Nested type declarations in TypeScript are done by following the class declaration with a 'namespace' declaration
    if (classType.nestedDeclarations.length > 0) {
      this.emit('\n\n');
      this.emitBlock(`${classType.exported ? 'export ' : ''}namespace ${classType.name}`, () => {
        this.emitList(classType.nestedDeclarations, '\n\n', (t) => this.renderDeclaration(t));
      });
    }
  }

  protected renderInterface(classType: InterfaceType) {
    const modifiers = classType.modifiers.length ? classType.modifiers.join(' ') + ' ' : '';

    this.renderDocs(classType);
    this.emit(`${modifiers}interface ${classType.name}`);

    if (classType.extends.length > 0) {
      this.emit(' extends ');
      this.emitList(classType.extends, ', ', (t) => this.renderType(t));
    }

    this.emitBlock(' ', () => {
      const members = [...classType.properties, ...classType.methods];

      this.emitList(members, '\n\n', (m) =>
        m instanceof Property ? this.renderProperty(m, 'interface') : this.renderMethod(m, 'interface'),
      );
    });
  }

  protected renderProperty(property: Property, parent: 'interface' | 'class') {
    if (parent === 'class' && property.isGetterSetter && !property.abstract) {
      this.renderGetterSetterProperty(property);
    } else {
      this.renderRegularProperty(property, parent);
    }
  }

  protected renderRegularProperty(property: Property, parent: 'interface' | 'class') {
    this.renderDocs(property);
    if (property.abstract) {
      this.emit('abstract ');
    }

    if (parent === 'class') {
      this.emit(visibilityToString(property.visibility));
      this.emit(' ');
    }

    if (property.static) {
      this.emit('static ');
    }

    // Regular property
    if (property.immutable) {
      this.emit('readonly ');
    }
    this.emit(property.name);
    if (property.optional) {
      this.emit('?');
    }
    this.emit(': ');
    this.renderType(property.type);

    if (property.initializer && parent === 'class') {
      this.emit(' = ');
      this.renderExpression(property.initializer);
    }

    this.emit(';');
  }

  protected renderGetterSetterProperty(property: Property) {
    const renderGs = (block: Block, getSet: string, args: Array<[Expression, Type]>, returnType?: Type) => {
      this.renderDocs(property);

      this.emit(visibilityToString(property.visibility));
      this.emit(' ');

      if (property.static) {
        this.emit('static ');
      }
      this.emit(getSet);
      this.emit(' ');

      this.emit(property.name);
      this.emit('(');
      this.emitList(args, ', ', ([name, type]) => {
        this.renderExpression(name);
        this.emit(': ');
        this.renderType(type);
      });
      this.emit(')');

      if (returnType) {
        this.emit(': ');
        this.renderType(returnType);
      }
      this.emit(' ');
      this.renderBlock(block);
    };

    const propertyType = property.optional ? property.type.optional() : property.type;

    if (property.getter) {
      renderGs(property.getter, 'get', [], propertyType);
    }

    if (property.setter) {
      this.emit('\n');
      const value = new Identifier('value');
      renderGs(property.setter(value), 'set', [[value, propertyType]]);
    }
  }

  protected renderMethod(method: Method, parent: 'interface' | 'class') {
    this.renderDocs(method);
    if (parent === 'class') {
      this.emit(visibilityToString(method.visibility));
      this.emit(' ');
    }
    if (method.static) {
      this.emit('static ');
    }
    if (method.abstract) {
      this.emit('abstract ');
    }
    this.emit(method.name);
    this.emit('(');
    this.emitList(method.parameters, ', ', (p) => {
      this.emit(p._identifier_);
      this.emit(': ');
      this.renderType(p.type);
    });
    this.emit(')');

    if (!(method instanceof Initializer)) {
      this.emit(': ');
      this.renderType(method.returnType);
    }

    if (method.body) {
      this.emit(' ');
      this.renderBlock(method.body);
    } else {
      this.emit(';');
    }
  }

  protected renderSymbol(sym: ThingSymbol) {
    return this.renderExpression(this.expressionFromSymbol(sym));
  }

  protected renderType(ref: Type): void {
    if (ref.isVoid) {
      return this.emit('void');
    }
    if (ref.primitive) {
      return this.emit(ref.primitive);
    }

    if (ref.symbol) {
      this.renderSymbol(ref.symbol);
      if (ref.genericArguments && ref.genericArguments.length > 0) {
        this.emit('<');
        this.emitList(ref.genericArguments, ', ', (t) => this.renderType(t));
        this.emit('>');
      }
      return;
    }

    if (ref.arrayOfType) {
      this.emit(`Array<`);
      this.renderType(ref.arrayOfType);
      this.emit('>');
      return;
    }
    if (ref.mapOfType) {
      this.emit(`Record<string, `);
      this.renderType(ref.mapOfType);
      this.emit('>');
      return;
    }
    if (ref.unionOfTypes) {
      return this.emitList(ref.unionOfTypes, ' | ', (x) => this.renderType(x));
    }

    this.emit('any');
  }

  /**
   * Look up a symbol and turn it into an expression
   */
  protected expressionFromSymbol(sym: ThingSymbol) {
    for (const scope of this.scopes) {
      // Defining scope is visible, so identifiers in it are as well
      if (sym.scope === scope) {
        return new Identifier(sym.name);
      }

      const imp = scope.findLink(sym.scope);
      if (imp) {
        return imp.referenceSymbol(sym);
      }
    }

    throw new Error(`Symbol ${sym} (in ${sym.scope}) not visible from ${this.scopes[0]} (missing import?)`);
  }

  protected renderFunction(func: CallableDeclaration) {
    this.renderDocs(func);
    this.emit(`// @ts-ignore TS6133\n`);

    this.emit(`function ${func.name}(`);
    this.emitList(func.parameters, ', ', (p) => {
      this.emit(`${p._identifier_}: `);
      this.renderType(p.type);
    });
    this.emit(')');
    if (func.returnType) {
      this.emit(': ');
      this.renderType(func.returnType);
    }

    if (func.body) {
      this.emit(' ');
      this.renderBlock(func.body);
    } else {
      this.emit(';');
    }
  }

  protected renderStatement(stmnt: Statement) {
    // FIXME: Comments
    const success = dispatchType(stmnt, [
      typeCase(SuperInitializer, (x) => {
        this.emit('super');
        this.renderArgs(x.args);
        this.emit(';');
      }),
      typeCase(ReturnStatement, (x) => this.renderReturnStatement(x)),
      typeCase(ExpressionStatement, (x) => {
        this.renderExpression(x.expression);
        this.emit(';');
      }),
      typeCase(IfThenElse, (x) => this.renderIfThenElse(x)),
      typeCase(Block, (x) => this.renderBlock(x)),
      typeCase(AssignmentStatement, (x) => {
        this.renderExpression(x.lhs);
        this.emit(' = ');
        this.renderExpression(x.rhs);
        this.emit(';');
      }),
      typeCase(VariableDeclaration, (x) => {
        this.emit(x.mut === Mut.Immutable ? 'const ' : 'let ');
        this.renderExpression(x.varName);
        this.emit(' = ');
        this.renderExpression(x.rhs);
        this.emit(';');
      }),
      typeCase(ForLoop, (x) => {
        this.emit('for (');
        this.emit(x.mut === Mut.Immutable ? 'const ' : 'let ');
        this.renderExpression(x.iterator);
        this.emit(' of ');
        if (x.iterable) {
          this.renderExpression(x.iterable);
        } else {
          this.emit('/* @error missing iterable */');
        }
        this.emit(') ');
        if (x.loopBody) {
          this.renderStatement(x.loopBody);
        } else {
          this.emit('/* @error missing loop body */');
        }
      }),
      typeCase(StatementSeparator, () => {
        this.emit('');
      }),
      typeCase(ThrowStatement, (x) => {
        this.emit('throw ');
        this.renderExpression(x.expression);
        this.emit(';');
      }),
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
      typeCase(JsLiteralExpression, (x) => this.emit(JSON.stringify(x._value_))),
      typeCase(ThisInstance, () => this.emit('this')),
      typeCase(NotExpression, (x) => {
        this.emit('!');
        this.renderExpression(x._operand_);
      }),
      typeCase(NewExpression, (x) => {
        this.emit('new ');
        this.renderType(x._typ_);
        this.renderArgs(x._args_);
      }),
      typeCase(TruthyOr, (x) => {
        this.renderExpression(x._value_);
        this.emit(' || ');
        this.renderExpression(x._defaultValue_);
      }),
      typeCase(SymbolReference, (x) => this.renderSymbol(x.symbol)),
      typeCase(DestructuringBind, (x) => {
        this.emit(x._structure_ === Structure.Array ? '[' : '{ ');
        this.emitList(x._names_, ', ', (e) => this.renderExpression(e));
        this.emit(x._structure_ === Structure.Array ? ']' : ' }');
      }),
      typeCase(Ternary, (x) =>
        this.parenthesized(() => {
          this.renderExpression(x._condition_);
          this.emit(' ? ');
          this.renderExpression(x._thenExpression_ ?? new Identifier('/* @error missing then */'));
          this.emit(' : ');
          this.renderExpression(x._elseExpression_ ?? new Identifier('/* @error missing else */'));
        }),
      ),
      typeCase(Null, () => this.emit('null')),
      typeCase(Undefined, () => this.emit('undefined')),
      typeCase(BinOp, (x) =>
        this.parenthesized(() => {
          this.renderExpression(x._lhs_);
          this.emit(` ${x._op_} `);
          this.renderExpression(x._rhs_);
        }),
      ),
      typeCase(IsObject, (x) =>
        this.parenthesized(() => {
          this.renderExpression(x._operand_);
          this.emit(' && typeof ');
          this.renderExpression(x._operand_);
          this.emit(" == 'object' && !Array.isArray(");
          this.renderExpression(x._operand_);
          this.emit(')');
        }),
      ),
      typeCase(IsNotNullish, (x) => {
        this.renderExpression(x._operand_);
        this.emit(' != null');
      }),

      typeCase(StrConcat, (x) => {
        this.emitList(x._operands_, ' + ', (op) => {
          this.renderExpression(op);
        });
      }),
    ]);

    if (!success) {
      this.emit(`/* @todo ${expr.constructor.name} */`);
    }
  }

  protected renderIdentifier(id: Identifier) {
    this.emit(id._identifier_);
  }

  protected renderObjectMethodInvoke(omi: ObjectMethodInvoke) {
    // FIXME: Simplify
    this.renderObjectAccess(new ObjectPropertyAccess(omi._obj_, omi._method_));
    this.renderArgs(omi._args_);
  }

  protected renderInvokeCallable(ic: InvokeCallable) {
    this.renderExpression(ic._callable_);
    this.renderArgs(ic._args_);
  }

  protected renderBlock(obj: Block) {
    this.emitBlock('', () => {
      this.emitList(obj.statements, '\n', (s) => this.renderStatement(s));
    });
  }

  protected renderArgs(args: Expression[]) {
    this.emit('(');
    this.emitList(args, ', ', (arg) => this.renderExpression(arg));
    this.emit(')');
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
    if (access._obj_ instanceof ObjectLiteral) {
      this.emit('(');
      this.renderObjectLiteral(access._obj_);
      this.emit(')');
    } else {
      this.renderExpression(access._obj_);
    }
    this.emit('.');
    this.emit(access._property_);
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

    if (isCallableDeclaration(el)) {
      for (const param of el.parameters) {
        tagged(`param ${param._identifier_}`, param.documentation);
      }
    }

    while (ret.length > 0 && ret[ret.length - 1] === '') {
      ret.pop();
    }

    if (ret.length === 0) {
      return;
    }

    this.emit('/**\n');
    for (const x of ret) {
      this.emit(` * ${x.replace(/\*\//g, '* /')}`.trimEnd() + '\n');
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

  private parenthesized(block: () => void) {
    this.openParen();
    block();
    this.closeParen();
  }

  /**
   * Open a parenthesized subexpression
   *
   * For now emits unconditionally, we can do something smart later.
   */
  private openParen() {
    this.emit('(');
  }

  /**
   * Close a parenthesized subexpression
   *
   * For now emits unconditionally, we can do something smart later.
   */
  private closeParen() {
    this.emit(')');
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

function visibilityToString(x: MemberVisibility): string {
  switch (x) {
    case MemberVisibility.Private:
      return 'private';
    case MemberVisibility.Protected:
      return 'protected';
    case MemberVisibility.Public:
      return 'public';
  }
}
