import { DocsSpec, Documented } from './documented';
import { Expression, ObjectPropertyAccess } from './expressions';
import { MemberType } from './member-type';
import { Block } from './statements/block';
import { Type } from './type';
import { MemberKind, MemberVisibility, TypeMember } from './type-member';

export interface PropertySpec {
  /**
   * The name of the property.
   *
   * @minLength 1
   */
  name: string;
  /**
   * Indicates if this property only has a getter (immutable).
   *
   * @default false
   */
  immutable?: boolean;
  /**
   * Indicates if this property is protected (otherwise it is public)
   *
   * @deprecated Use visibility instead.
   * @default false
   */
  protected?: boolean;

  /**
   * Indicates the visibility of this property
   *
   * Cannot be used together with `protected`.
   *
   * @default false
   */
  visibility?: MemberVisibility;

  /**
   * Indicates if this property is abstract
   *
   * @default false
   */
  abstract?: boolean;
  /**
   * Indicates if this is a static property.
   *
   * @default false
   */
  static?: boolean;
  /**
   * A hint that indicates that this static, immutable property is initialized
   * during startup. This allows emitting "const" idioms in different target
   * languages. Implies `static` and `immutable`.
   *
   * @default false
   */
  const?: boolean;
  /**
   * Documentation for this entity.
   *
   * @default none
   */
  docs?: DocsSpec;
  /**
   * Determines whether the value is, indeed, optional.
   *
   * @default false
   */
  optional?: boolean;
  /**
   * The declared type of the value, when it's present.
   */
  type: Type;
  /**
   * The initial assignment of the property.
   */
  initializer?: Expression;
  /**
   * Body of the getter implementation
   */
  getterBody?: Block;
  /**
   * Signature and body of the setter implementation
   */
  setterBody?: (value: Expression) => Block;
}

export interface IProperty extends Documented {
  readonly name: string;
  readonly abstract: boolean;
  readonly immutable: boolean;
  readonly optional: boolean;
  readonly type: Type;
  readonly initializer?: Expression;
  readonly visibility: MemberVisibility;
  readonly static: boolean;
}

export class Property extends TypeMember implements IProperty {
  public readonly kind = MemberKind.Property;

  /**
   * Indicates if this property only has a getter (immutable).
   */
  public get immutable(): boolean {
    return !!this.spec.immutable;
  }

  /**
   * Is the property optional.
   */
  public get optional(): boolean {
    return !!this.spec?.optional;
  }

  /**
   * The visibility of the member.
   */
  public get visibility(): MemberVisibility {
    if (this.spec?.visibility !== undefined) {
      return this.spec.visibility;
    }
    if (this.spec?.protected) {
      return MemberVisibility.Protected;
    }
    return MemberVisibility.Public;
  }

  public get initializer() {
    return this.spec.initializer;
  }

  /**
   * The type of the property as a reference.
   */
  public readonly type: Type;

  public constructor(public readonly scope: MemberType, public readonly spec: PropertySpec) {
    super(scope, {
      ...spec,
    });
    this.type = spec.type;
  }

  /**
   * Read a property from an object
   */
  public from(x: Expression): Expression {
    return new ObjectPropertyAccess(x, this.name);
  }

  public get getter() {
    return this.spec.getterBody;
  }

  public get setter() {
    return this.spec.setterBody;
  }

  public get isGetterSetter() {
    return this.getter || this.setter;
  }
}
