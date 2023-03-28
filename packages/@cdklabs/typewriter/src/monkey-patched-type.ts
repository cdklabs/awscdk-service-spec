import { ClassType } from './class';
import * as expr from './expressions/builder';
import { MemberType } from './member-type';
import { Module } from './module';
import { IScope } from './scope';
import { MonkeyPatchMethod, Statement } from './statements';
import { DeclarationKind } from './type-declaration';

/**
 * Monkey patch a target type, either class or interface
 */
export class MonkeyPatchedType extends MemberType {
  public kind = DeclarationKind.MonkeyPatch;
  public readonly targetModule: Module;
  public readonly isClass: boolean;

  constructor(declarationScope: IScope, public readonly targetType: MemberType) {
    // targetType is a MemberType, which implies it is a Declaration.  However,
    // we usually won't have the Declaration, so we need to make a fake one,
    // which is a bit silly. On the other hand, it works out nicely if we need to
    // generate that class as well (for testing purposes perhaps).
    super(declarationScope, {
      // We need a fake name to register ourselves into our target declaration scope,
      // we're never directly referencing it anyway
      name: `Monkey_${targetType.name}`,
    });

    this.targetModule = Module.of(targetType);
    this.isClass = targetType instanceof ClassType;
  }

  public get monkeyPatchStatements(): Statement[] {
    // If we are patching an interface, there is no implementation to add a statement on to
    if (!this.isClass) {
      return [];
    }

    const targetClass = expr.sym(this.targetType.symbol);
    return this.methods
      .filter((m) => m.body)
      .map((m) => new MonkeyPatchMethod(targetClass, m.name, m.parameters, m.body!));
  }
}
