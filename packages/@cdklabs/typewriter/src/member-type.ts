import { Property, PropertySpec } from './property';
import { DeclarationKind, TypeDeclaration } from './type-declaration';
import { Method, MethodSpec } from './type-member';

/**
 * A type that has members
 */
export abstract class MemberType extends TypeDeclaration {
  public abstract readonly kind: DeclarationKind;

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
  public addProperty(spec: PropertySpec): Property {
    if (spec.protected && spec.visibility) {
      throw new Error('Cannot specify both "protected" and "visibility"');
    }

    const prop = new Property(this, {
      ...spec,
    });

    this._properties.push(prop);

    return prop;
  }

  public addMethod(spec: MethodSpec): Method {
    const m = new Method(this, spec);
    this._methods.push(m);
    return m;
  }
}
