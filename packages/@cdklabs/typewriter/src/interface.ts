import * as jsii from '@jsii/spec';
import { Property, PropertySpec } from './property';
import { Scope } from './scope';
import { Type } from './type';

export interface InterfaceSpec extends Omit<jsii.InterfaceType, 'assembly' | 'fqn'> {
  export?: boolean;
  properties?: PropertySpec[];
}

export class InterfaceType extends Type {
  /**
   * Lists all direct properties of the interface
   */
  public get properties(): Map<string, Property> {
    const result = new Map<string, Property>();

    for (const p of this.spec.properties ?? []) {
      result.set(p.name, new Property(this, p));
    }

    return result;
  }

  /**
   * List the modifiers of the interface
   */
  public get modifiers(): Array<string> {
    const modifiers = [];

    if (this.spec.export) {
      modifiers.push('export');
    }
    return modifiers;
  }

  public constructor(public scope: Scope, public readonly spec: InterfaceSpec) {
    super(scope, spec);
  }

  /**
   * Adds a property to the interface
   */
  public addProperty(spec: PropertySpec) {
    if (!this.spec.properties) {
      this.spec.properties = [];
    }
    this.spec.properties.push(spec);
  }
}
