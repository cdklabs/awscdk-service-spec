import { Property, PropertySpec } from './property';
import { SymbolKind } from './symbol';
import { TypeDeclaration } from './type-declaration';
import { Method, MethodSpec } from './type-member';

/**
 * A type that has members
 */
export abstract class MemberType extends TypeDeclaration {
  public abstract readonly kind: SymbolKind;

  private readonly _properties = new Array<Property>();
  private readonly _methods = new Array<Method>();

  /**
   * Lists all direct properties of the interface
   */
  public get properties(): ReadonlyArray<Property> {
    return this._properties;
  }

  /**
   * Lists all direct methods of the interface
   */
  public get methods(): ReadonlyArray<Method> {
    return this._methods;
  }

  /**
   * Adds a property to the interface
   */
  public addProperty(spec: PropertySpec) {
    this._properties.push(
      new Property(this, {
        ...spec,
        immutable: true,
      }),
    );
  }

  public addMethod(spec: MethodSpec) {
    const m = new Method(this, spec);
    this._methods.push(m);
    return m;
  }
}
