import { PropertyType, Resource, RichTypedField, SpecDatabase, TypeDefinition } from '@aws-cdk/service-spec-types';

/**
 * A property, attribute or struct field as CDK renders it
 */
export interface RenderedField {
  readonly type: PropertyType;
  readonly required: boolean;
}

/**
 * What CDK renders as L1 code for one resource
 *
 * This follows the rules of the CDK code generator: every property, attribute and struct field renders the oldest
 * type of its type history, resource properties other than the tags also render the later types in their history
 * as unused structs, and type definitions flagged `mustRenderForBwCompat` are always rendered.
 */
export class L1View {
  public readonly properties: Record<string, RenderedField>;
  public readonly attributes: Record<string, RenderedField>;
  /**
   * The rendered structs, by name
   */
  public readonly structs = new Map<string, TypeDefinition>();

  constructor(public readonly db: SpecDatabase, public readonly resource: Resource) {
    const tagProperty = resource.tagInformation?.tagPropertyName;

    this.properties = mapValues(resource.properties, (prop, name) => {
      const history = new RichTypedField(prop).types();
      for (const type of name === tagProperty ? history.slice(0, 1) : history) {
        this.addStructs(type);
      }
      return { type: history[0], required: name !== tagProperty && !!prop.required };
    });
    this.attributes = mapValues(resource.attributes, (attr) => {
      const type = new RichTypedField(attr).types()[0];
      this.addStructs(type);
      return { type, required: false };
    });
    for (const { entity } of db.follow('usesType', resource)) {
      if (entity.mustRenderForBwCompat) {
        this.addStruct(entity);
      }
    }
  }

  /**
   * The rendered fields of a struct
   */
  public fields(struct: TypeDefinition): Record<string, RenderedField> {
    return mapValues(struct.properties, (prop) => ({
      type: new RichTypedField(prop).types()[0],
      required: !!prop.required,
    }));
  }

  private addStructs(type: PropertyType) {
    for (const struct of referencedStructs(this.db, type)) {
      this.addStruct(struct);
    }
  }

  private addStruct(struct: TypeDefinition) {
    if (this.structs.has(struct.name)) {
      return;
    }
    this.structs.set(struct.name, struct);
    for (const prop of Object.values(struct.properties)) {
      this.addStructs(new RichTypedField(prop).types()[0]);
    }
  }
}

/**
 * The type as L1 code renders it, with structs by name
 *
 * Integers and numbers are the same in L1 code, and allowed values are not rendered.
 */
export function renderType(db: SpecDatabase, type: PropertyType): string {
  switch (type.type) {
    case 'integer':
    case 'number':
      return 'number';
    case 'array':
      return `Array<${renderType(db, type.element)}>`;
    case 'map':
      return `Map<string, ${renderType(db, type.element)}>`;
    case 'ref':
      return db.get('typeDefinition', type.reference).name;
    case 'union':
      return type.types
        .map((t) => renderType(db, t))
        .sort()
        .join(' | ');
    default:
      return type.type;
  }
}

/**
 * The structs a type refers to, looking into lists, maps and unions
 */
export function referencedStructs(db: SpecDatabase, type: PropertyType): TypeDefinition[] {
  switch (type.type) {
    case 'array':
    case 'map':
      return referencedStructs(db, type.element);
    case 'union':
      return type.types.flatMap((t) => referencedStructs(db, t));
    case 'ref':
      return [db.get('typeDefinition', type.reference)];
    default:
      return [];
  }
}

function mapValues<A, B>(xs: Record<string, A>, fn: (x: A, key: string) => B): Record<string, B> {
  return Object.fromEntries(Object.entries(xs).map(([k, x]) => [k, fn(x, k)]));
}
