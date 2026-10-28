import {
  Attribute,
  Property,
  PropertyType,
  Resource,
  RichPropertyType,
  RichTypedField,
  SpecDatabase,
  TypeDefinition,
} from '@aws-cdk/service-spec-types';
import { ref } from '@cdklabs/tskb';
import { L1Change } from '../l1-compat';
import { matchShape, pairTypeDefinitions, referencedTypeDefinitions } from '../type-pairing';

/**
 * Make the type history of a released database the oldest part of every type history in `db`
 *
 * `db` must already hold the current sources. Every property, attribute and type definition field that exists in
 * both databases gets the released types first, followed by its current types, so the type a released L1 renders
 * (always the oldest one) stays the same when a schema renames or merges its type definitions. A released type
 * stays only if a current type at its position renamed or merged it (the same arrays, maps and unions around type
 * definitions with the same name or a shared field), or the current types already contain it; any other type change
 * is CloudFormation's, and the field follows the current sources.
 *
 * Released type definitions that the current sources no longer have are recreated, but only with the fields that
 * still exist in a current type at any position where the released type was used. Released resources and properties
 * that the current sources no longer have are not recreated. Requiredness, documentation and all other details stay
 * as the current sources describe them.
 *
 * Returns, as CloudFormation changes, the fields that a released type keeps for one of its positions although no
 * current type at another of its positions has them. The L1 renders such a field at every position of the type.
 */
export function importTypeHistory(db: SpecDatabase, released: SpecDatabase): L1Change[] {
  const changes = new Array<L1Change>();
  for (const releasedResource of released.all('resource')) {
    const current = db.lookup('resource', 'cloudFormationType', 'equals', releasedResource.cloudFormationType);
    if (current.length > 0) {
      changes.push(...new ResourceHistoryImport(db, released, releasedResource, current.only()).import());
    }
  }
  return changes;
}

class ResourceHistoryImport {
  /** Current type definitions paired with each released type definition (by released id) */
  private readonly paired: Map<string, Set<TypeDefinition>>;
  private readonly currentByName: Map<string, TypeDefinition>;
  /** The field names of each current type definition before the import (by id) */
  private readonly currentFields: Map<string, Set<string>>;
  /** The type definition in `db` for each released type definition that is kept (by released id) */
  private readonly targets = new Map<string, TypeDefinition>();
  /** The fields that are kept for each released type definition (by released id) */
  private readonly keptFields = new Map<string, string[]>();
  private readonly changes = new Map<string, L1Change>();

  constructor(
    private readonly db: SpecDatabase,
    private readonly released: SpecDatabase,
    private readonly releasedResource: Resource,
    private readonly resource: Resource,
  ) {
    this.paired = pairTypeDefinitions(released, releasedResource, db, resource);
    const currentTypes = db.follow('usesType', resource).map(({ entity }) => entity);
    this.currentByName = new Map(currentTypes.map((t) => [t.name, t]));
    this.currentFields = new Map(currentTypes.map((t) => [t.$id, new Set(Object.keys(t.properties))]));
  }

  public import(): L1Change[] {
    // First decide which released type definitions survive, so references to them can be translated
    for (const bag of ['properties', 'attributes'] as const) {
      for (const [name, field] of Object.entries(this.releasedResource[bag])) {
        if (this.resource[bag][name]) {
          this.visitTypes(field);
        }
      }
    }
    for (const { entity } of this.released.follow('usesType', this.releasedResource)) {
      if (entity.mustRenderForBwCompat) {
        this.visitTypeDefinition(entity);
      }
    }

    for (const [releasedId, target] of this.targets) {
      const releasedType = this.released.get('typeDefinition', releasedId);
      for (const name of this.keptFields.get(releasedId)!) {
        const position = `field ${releasedType.name}.${name}`;
        const current = target.properties[name];
        if (current) {
          this.prependHistory(position, releasedType.properties[name], current);
        } else {
          target.properties[name] = this.releasedField(position, releasedType, name);
        }
      }
      if (releasedType.mustRenderForBwCompat) {
        target.mustRenderForBwCompat = true;
      }
    }

    for (const bag of ['properties', 'attributes'] as const) {
      for (const [name, field] of Object.entries(this.releasedResource[bag])) {
        const current = this.resource[bag][name];
        if (current) {
          this.prependHistory(`${bag === 'properties' ? 'property' : 'attribute'} ${name}`, field, current);
        }
      }
    }

    return [...this.changes.values()];
  }

  private visitTypes(field: Property | Attribute) {
    for (const type of new RichTypedField(field).types()) {
      for (const typeDef of referencedTypeDefinitions(this.released, type)) {
        this.visitTypeDefinition(typeDef);
      }
    }
  }

  private visitTypeDefinition(releasedType: TypeDefinition) {
    if (this.keptFields.has(releasedType.$id)) {
      return;
    }

    // A released field survives if a current type definition at the same position still has it
    const paired = [...(this.paired.get(releasedType.$id) ?? [])];
    const kept = Object.keys(releasedType.properties).filter((name) => paired.some((t) => t.properties[name]));
    this.keptFields.set(releasedType.$id, kept);

    const sameName = this.currentByName.get(releasedType.name);
    if (kept.length === 0 && !sameName) {
      return;
    }
    this.targets.set(releasedType.$id, sameName ?? this.createTypeDefinition(releasedType));

    for (const name of kept) {
      this.visitTypes(releasedType.properties[name]);
    }
  }

  private createTypeDefinition(releasedType: TypeDefinition): TypeDefinition {
    const typeDef = this.db.allocate('typeDefinition', {
      name: releasedType.name,
      documentation: releasedType.documentation,
      properties: {},
    });
    this.db.link('usesType', this.resource, typeDef);
    return typeDef;
  }

  /**
   * Put the released types before the types of a current field
   *
   * The field is updated in place, because a nested read-only field is the same object as its attribute, and keeps
   * all its other details.
   */
  private prependHistory(position: string, releasedField: Property | Attribute, current: Property | Attribute) {
    const currentTypes = new RichTypedField(current).types();
    const releasedTypes = this.keptReleasedTypes(position, releasedField, currentTypes);
    if (releasedTypes.length === 0) {
      return;
    }

    const history = new RichTypedField({
      type: releasedTypes[releasedTypes.length - 1],
      previousTypes: releasedTypes.slice(0, -1),
    });
    for (const type of currentTypes) {
      history.updateType(type);
    }
    // A type that both have keeps the details of the current one, like its allowed values
    setTypeHistory(
      current,
      history.types().map((t) => currentTypes.find((c) => new RichPropertyType(c).equals(t)) ?? t),
    );
  }

  /**
   * A kept released field for a type definition that the current sources do not give it
   *
   * If none of its released types stay, it takes the types of the same field at its position.
   */
  private releasedField(position: string, releasedType: TypeDefinition, name: string): Property {
    // Kept fields exist in at least one paired type definition
    const atPosition = [...this.paired.get(releasedType.$id)!].filter((t) => t.properties[name]);
    const currentTypes = atPosition.flatMap((t) => new RichTypedField(t.properties[name]).types());
    const releasedTypes = this.keptReleasedTypes(position, releasedType.properties[name], currentTypes);
    if (releasedTypes.length > 0) {
      const field = structuredClone(releasedType.properties[name]);
      setTypeHistory(field, releasedTypes);
      return field;
    }
    return structuredClone(atPosition[0].properties[name]);
  }

  /**
   * The released types of a field that stay in its history, translated into `db`
   *
   * A released type stays if the current types at its position already contain it, or if a current type at the
   * position renamed or merged it: that type has the same shape, with type definitions that are paired with the
   * released ones (see `pairTypeDefinitions`). Any other released type was changed by CloudFormation, for example
   * into an array, a union or an unrelated type, so the field follows the current sources.
   */
  private keptReleasedTypes(
    position: string,
    releasedField: Property | Attribute,
    currentTypes: PropertyType[],
  ): PropertyType[] {
    const atPosition = new Set(currentTypes.flatMap((t) => referencedTypeDefinitions(this.db, t)).map((t) => t.$id));
    const isPaired = (releasedType: TypeDefinition, current: TypeDefinition) =>
      !!this.paired.get(releasedType.$id)?.has(current);
    const kept = new Array<PropertyType>();
    for (const releasedType of new RichTypedField(releasedField).types()) {
      const type = this.translate(releasedType);
      if (!type) {
        continue;
      }
      const releasedTypeDefs = referencedTypeDefinitions(this.released, releasedType);
      const renamed =
        releasedTypeDefs.length > 0 &&
        currentTypes.some((t) => matchShape(this.released, releasedType, this.db, t, isPaired) !== undefined);
      if (renamed || currentTypes.some((t) => new RichPropertyType(t).equals(type))) {
        kept.push(type);
        this.reportFieldsMissingAt(position, releasedTypeDefs, atPosition);
      }
    }
    return kept;
  }

  /**
   * Report the kept fields of released type definitions that no current type at a position has
   */
  private reportFieldsMissingAt(position: string, releasedTypeDefs: TypeDefinition[], atPosition: Set<string>) {
    for (const releasedType of releasedTypeDefs) {
      for (const name of this.keptFields.get(releasedType.$id) ?? []) {
        if (![...atPosition].some((id) => this.currentFields.get(id)?.has(name))) {
          const change: L1Change = {
            kind: 'cloudformation-change',
            resource: this.resource.cloudFormationType,
            element: `field ${releasedType.name}.${name}`,
            description: `kept from the released type, but no current type at ${position} has it`,
          };
          this.changes.set(`${change.element}: ${change.description}`, change);
        }
      }
    }
  }

  /**
   * Translate a released type into the same type in `db`, or undefined if it refers to a type definition that is not kept
   */
  private translate(type: PropertyType): PropertyType | undefined {
    switch (type.type) {
      case 'array':
      case 'map': {
        const element = this.translate(type.element);
        return element ? { ...type, element } : undefined;
      }
      case 'union': {
        const types = type.types.map((t) => this.translate(t));
        return types.every(isDefined) ? { type: 'union', types } : undefined;
      }
      case 'ref': {
        const target = this.targets.get(type.reference.$ref);
        return target ? { type: 'ref', reference: ref(target) } : undefined;
      }
      default:
        return structuredClone(type);
    }
  }
}

function setTypeHistory(field: Property | Attribute, types: PropertyType[]) {
  field.type = types[types.length - 1];
  if (types.length > 1) {
    field.previousTypes = types.slice(0, -1);
  } else {
    delete field.previousTypes;
  }
}

function isDefined<A>(x: A | undefined): x is A {
  return x !== undefined;
}
