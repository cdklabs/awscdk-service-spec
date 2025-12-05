import { Renderer, RenderOptions } from './base';
import { CallableDeclaration, isCallableDeclaration } from '../callable';
import { ClassType } from '../class';
import { Documented } from '../documented';
import { EsLintRules } from '../eslint-rules';
import {
  AnonymousInterfaceImplementation,
  Expression,
  Lambda,
  Splat,
  SymbolReference,
  BinOp,
  DestructuringBind,
  DirectCode,
  Identifier,
  IsNotNullish,
  IsObject,
  JsLiteralExpression,
  ListLiteral,
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
import { AliasedModuleImport, Module, SelectiveModuleImport } from '../module';
import { MonkeyPatchedType } from '../monkey-patched-type';
import { Parameter } from '../parameter';
import { IProperty, Property } from '../property';
import { AMBIENT_SCOPE } from '../scope';
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
  ThrowStatement,
  MonkeyPatchMethod,
  EmptyStatement,
  TypeDeclarationStatement,
} from '../statements';
import { StructType } from '../struct';
import { ThingSymbol } from '../symbol';
import { PrimitiveType, Type } from '../type';
import { Exported, TypeParameterSpec } from '../type-declaration';
import { Initializer, MemberVisibility, Method } from '../type-member';

/**
 * Options to render TypeScript
 */
export interface TypeScriptRenderOptions extends RenderOptions {
  /**
   * Eslint rules to disable. These are disabled in the entire generated module.
   *
   * @default: max-len, prettier/prettier
   */
  disabledEsLintRules?: string[];
}

export class TypeScriptRenderer extends Renderer {
  private disabledEsLintRules: string[];
  public constructor(options: TypeScriptRenderOptions = {}) {
    super(options);

    this.disabledEsLintRules = options.disabledEsLintRules ?? [EsLintRules.PRETTIER_PRETTIER, EsLintRules.MAX_LEN];
  }

  protected renderModule(mod: Module) {
    this.withScope(mod, () => {
      for (const doc of mod.documentation) {
        this.emit(`// ${doc}\n`);
      }
      this.renderEslint();
      this.renderImports(mod);
      this.renderModuleTypes(mod);

      if (mod.initialization.length > 0) {
        this.emit('\n');
      }
      this.emitList(mod.initialization, '\n', (s) => this.renderStatement(s));
    });
  }

  protected renderImports(mod: Module) {
    for (const imp of mod.imports) {
      if (imp instanceof AliasedModuleImport) {
        this.emit(`import * as ${imp.importAlias} from "${imp.moduleSource}";\n`);
      } else if (imp instanceof SelectiveModuleImport) {
        const names = imp.importedNames.map((name) => {
          const alias = imp.getAlias(name);
          return alias ? `${name} as ${alias}` : name;
        });
        this.emit(`import { ${names.join(', ')} } from "${imp.moduleSource}";\n`);
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
    this.emit(`${modifiers}interface ${structType.name}`);
    this.renderTypeParameters(structType.typeParameters);

    if (structType.extends.length > 0) {
      this.emit(' extends ');
      this.emitList(structType.extends, ', ', (t) => this.renderType(t));
    }

    this.emitBlock(' ', () => {
      const props = Array.from(structType.properties.values()).filter((p) => p.visibility === MemberVisibility.Public);

      this.emitList(props, '\n\n', (p) => this.renderProperty(p, 'interface'));
    });
  }

  protected renderClass(classType: ClassType) {
    const modifiers = classType.modifiers.length ? classType.modifiers.join(' ') + ' ' : '';

    this.renderDocs(classType);
    this.emit(`${modifiers}class ${classType.name}`);
    this.renderTypeParameters(classType.typeParameters);

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

  protected renderInterface(interfaceType: InterfaceType) {
    const modifiers = interfaceType.modifiers.length ? interfaceType.modifiers.join(' ') + ' ' : '';

    this.renderDocs(interfaceType);
    this.emit(`${modifiers}interface ${interfaceType.name}`);
    this.renderTypeParameters(interfaceType.typeParameters);

    if (interfaceType.extends.length > 0) {
      this.emit(' extends ');
      this.emitList(interfaceType.extends, ', ', (t) => this.renderType(t));
    }

    this.emitBlock(' ', () => {
      const members = [...interfaceType.properties, ...interfaceType.methods];

      this.emitList(members, '\n\n', (m) =>
        m instanceof Property ? this.renderProperty(m, 'interface') : this.renderMethod(m, 'interface'),
      );
    });
  }

  protected renderMonkeyPatch(monkey: MonkeyPatchedType) {
    this.emitBlock(`declare module "${monkey.targetModule.importName}"`, () => {
      this.emitBlock(`interface ${monkey.targetType.name}`, () => {
        const members = [...monkey.properties, ...monkey.methods];

        this.emitList(members, '\n\n', (m) =>
          m instanceof Property ? this.renderProperty(m, 'interface') : this.renderMethod(m, 'interface'),
        );
      });
    });

    if (monkey.monkeyPatchStatements) {
      this.emit('\n\n');
      this.emitList(monkey.monkeyPatchStatements, '\n', (x) => this.renderStatement(x));
    }
  }

  protected renderProperty(property: Property, parent: 'interface' | 'class') {
    if (parent === 'class' && property.isGetterSetter && !property.abstract) {
      this.renderGetterSetterProperty(property);
    } else {
      this.renderRegularProperty(property, parent);
    }
  }

  protected renderRegularProperty(property: IProperty, parent: 'interface' | 'class') {
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
    this.renderPropertyName(property.name);
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

  protected renderPropertyName(name: string) {
    return this.emit(name.match(/[^a-zA-Z0-9_]/) ? JSON.stringify(name) : name);
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
    this.renderParameters(method.parameters);

    if (!(method instanceof Initializer)) {
      this.emit(': ');
      this.renderType(method.returnType);
    }

    if (method.body && parent === 'class') {
      this.emit(' ');
      this.renderBlock(method.body);
    } else {
      this.emit(';');
    }
  }

  protected renderParameters(parameters: Parameter[]) {
    this.emit('(');
    this.emitList(parameters, ', ', (p) => {
      this.emit(p._identifier_);
      if (p.optional && !p.default) {
        this.emit('?');
      }
      this.emit(': ');
      this.renderType(p.type);
      if (p.default) {
        this.emit(' = ');
        this.renderExpression(p.default);
      }
    });
    this.emit(')');
  }

  protected renderSymbol(sym: ThingSymbol) {
    return this.renderExpression(this.expressionFromSymbol(sym));
  }

  protected renderTypeParameters(params?: ReadonlyArray<TypeParameterSpec>) {
    const renderParam = (p: TypeParameterSpec) => {
      this.emit(p.name);
      if (p.extendsType) {
        this.emit(' extends ');
        this.renderType(p.extendsType);
      }
    };

    if (params && params.length > 0) {
      this.emit('<');
      this.emitList(params, ', ', renderParam);
      this.emit('>');
    }
  }

  protected renderType(ref: Type): void {
    if (ref.isVoid) {
      return this.emit('void');
    }
    if (ref.primitive) {
      switch (ref.primitive) {
        case PrimitiveType.DateTime:
          return this.emit('Date');
        default:
          return this.emit(ref.primitive);
      }
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
    if (ref.object) {
      this.emit('{ ');
      const props = Array.from(ref.object || []).filter((p) => p.visibility === MemberVisibility.Public);
      this.emitList(props, ' ', (p) => this.renderRegularProperty(p, 'interface'));
      this.emit(' }');
      return;
    }

    this.emit('any');
  }

  /**
   * Look up a symbol and turn it into an expression
   */
  protected expressionFromSymbol(sym: ThingSymbol) {
    // the ambient scope is always visible
    if (sym.scope === AMBIENT_SCOPE) {
      return new Identifier(sym.name);
    }

    for (const scope of this.scopes) {
      const expr = scope.symbolToExpression(sym);
      if (expr) {
        return expr;
      }
    }

    throw new Error(`Symbol ${sym} (in ${sym.scope}) not visible from ${this.scopes[0]} (missing import?)`);
  }

  protected renderFunction(func: CallableDeclaration & Exported) {
    this.renderDocs(func);
    this.emit(`// @ts-ignore TS6133\n`);
    this.emit(`${func.exported ? 'export ' : ''}function ${func.name}`);
    this.renderParameters(func.parameters);
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

  protected renderComment(text: string) {
    this.emit(`// ${text}`);
  }

  protected renderInlineComment(text: string) {
    this.emit(`/* ${text} */ `);
  }

  protected renderStatement(stmnt: Statement) {
    this.emitList(stmnt._comments_, '\n', (x) => this.renderComment(x));

    if (stmnt instanceof EmptyStatement) {
      return;
    }

    // Ensure comments are in a separate line
    if (stmnt._comments_.length) {
      this.emit('\n');
    }

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
      typeCase(ThrowStatement, (x) => {
        this.emit('throw ');
        this.renderExpression(x.expression);
        this.emit(';');
      }),
      typeCase(MonkeyPatchMethod, (x) => {
        // Monkey patching in JavaScript:
        // <class>.prototype.<name> = function(<parameters>) { <body> }
        this.renderExpression(x.targetClass);
        this.emit('.prototype.');
        this.emit(x.method);
        // Must use function, not fat-arrow, because 'this' must remain floating
        this.emit(' = function');
        this.renderParameters(x.parameters);
        this.emit(' ');
        this.renderBlock(x.body);
        this.emit(';');
      }),
      typeCase(TypeDeclarationStatement, (x) => {
        this.renderDeclaration(x.decl);
      }),
    ]);

    if (!success) {
      this.emit(`/* @todo ${stmnt.constructor.name} */`);
    }
  }

  protected renderExpression(expr: Expression): void {
    if (expr._comments_.length) {
      this.renderInlineComment(expr._comments_.join(', '));
    }

    const success = dispatchType(expr, [
      typeCase(DirectCode, (x) => this.emit(x._code_)),
      typeCase(ObjectLiteral, (x) => this.renderObjectLiteral(x)),
      typeCase(ListLiteral, (x) => {
        this.emit('[');
        this.emitList(x._elements_, ', ', (e) => this.renderExpression(e));
        this.emit(']');
      }),
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

      typeCase(AnonymousInterfaceImplementation, (x) =>
        this.emitBlock('', () =>
          this.emitList(Object.entries(x.members), ',\n', ([key, val]) => {
            this.renderPropertyName(key);
            this.emit(': ');
            this.renderExpression(val);
          }),
        ),
      ),

      typeCase(Lambda, (x) => {
        this.renderParameters(x.params);
        this.emit(' => ');
        if (x.body instanceof Statement) {
          this.renderStatement(x.body);
        } else {
          this.renderExpression(x.body);
        }
      }),

      typeCase(Splat, (x) => {
        this.emit('...');
        this.renderExpression(x._operand_);
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
    if (obj._contents_.length === 0) {
      return this.emit('{}');
    }

    this.emitBlock('', () => {
      this.emitList(obj._contents_, ',\n', (what) => {
        if (what instanceof Splat) {
          this.renderExpression(what);
        } else {
          const [key, val] = what;
          this.renderPropertyName(key);
          this.emit(': ');
          this.renderExpression(val);
        }
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
      this.emit(' else ');
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

    for (const key in el.docs?.docTags) {
      tagged(key, el.docs?.docTags[key]);
    }

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

  private renderEslint() {
    this.emit(this.disabledEsLintRules.length > 0 ? '/* eslint-disable ' : '');
    this.emitList(this.disabledEsLintRules, ', ', (rule) => this.emit(rule));
    this.emit(this.disabledEsLintRules.length > 0 ? ' */\n' : '');
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
