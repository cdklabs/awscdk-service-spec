import {
  Attribute,
  Property,
  PropertyType,
  Resource,
  RichTypedField,
  SpecDatabase,
  TypeDefinition,
} from '@aws-cdk/service-spec-types';
import { matchShape, pairTypeDefinitions, referencedTypeDefinitions } from './type-pairing';

export type L1ChangeKind = 'loss' | 'cloudformation-change' | 'addition';

/**
 * A change to what CDK renders as L1 code
 *
 * - `loss`: a released type or field is gone while CloudFormation still has it under another type name, so the
 *   build lost type history (for example when a schema renames or merges type definitions).
 * - `cloudformation-change`: CloudFormation removed something from every current type, or changed a type or
 *   whether a field is required.
 * - `addition`: something new; never breaking.
 */
export interface L1Change {
  readonly kind: L1ChangeKind;
  readonly resource: string;
  /**
   * The changed L1 element, for example `property Settings`, `type SettingsRequest` or `field SettingsRequest.Url`
   */
  readonly element: string;
  readonly description: string;
}

/**
 * Compare the L1 code CDK renders from a released database with what it renders from a new one
 *
 * The comparison follows the rules of the CDK code generator: every property, field and attribute renders its
 * oldest type, resource properties also render the later types in their history, and type definitions flagged
 * `mustRenderForBwCompat` are always rendered.
 */
export function compareL1(released: SpecDatabase, current: SpecDatabase): L1Change[] {
  const changes = new Array<L1Change>();

  for (const releasedResource of released.all('resource')) {
    const found = current.lookup('resource', 'cloudFormationType', 'equals', releasedResource.cloudFormationType);
    if (found.length === 0) {
      changes.push({
        kind: 'cloudformation-change',
        resource: releasedResource.cloudFormationType,
        element: 'resource',
        description: 'removed',
      });
      continue;
    }
    changes.push(...new ResourceComparison(released, releasedResource, current, found.only()).compare());
  }

  for (const resource of current.all('resource')) {
    if (released.lookup('resource', 'cloudFormationType', 'equals', resource.cloudFormationType).length === 0) {
      changes.push({
        kind: 'addition',
        resource: resource.cloudFormationType,
        element: 'resource',
        description: 'added',
      });
    }
  }

  return changes.sort((a, b) => a.resource.localeCompare(b.resource) || a.element.localeCompare(b.element));
}

/**
 * Whether any of the changes is a loss of released type history
 */
export function hasL1Loss(changes: L1Change[]) {
  return changes.some((c) => c.kind === 'loss');
}

/**
 * A human-readable report of the losses and CloudFormation changes
 */
export function formatL1Changes(changes: L1Change[]): string {
  const count = (kind: L1ChangeKind) => changes.filter((c) => c.kind === kind).length;
  const counts = [
    `${count('loss')} rename or merge losses`,
    `${count('cloudformation-change')} CloudFormation changes`,
    `${count('addition')} additions`,
  ];
  const lines = [
    `L1 compatibility with the released database: ${hasL1Loss(changes) ? 'FAIL' : 'OK'} (${counts.join(', ')})`,
  ];

  const section = (kind: L1ChangeKind, title: string) => {
    const ofKind = changes.filter((c) => c.kind === kind);
    if (ofKind.length === 0) {
      return;
    }
    lines.push('', title);
    for (const resource of [...new Set(ofKind.map((c) => c.resource))].sort()) {
      lines.push(`  ${resource}`);
      for (const change of ofKind.filter((c) => c.resource === resource)) {
        lines.push(`    ${change.element}: ${change.description}`);
      }
    }
  };
  section('loss', 'Rename or merge losses (these fail the check; the build lost released type history):');
  section('cloudformation-change', 'CloudFormation changes (reported only):');

  return lines.join('\n');
}

/**
 * What CDK renders for one resource
 */
class L1View {
  public readonly properties: Record<string, RenderedField>;
  public readonly attributes: Record<string, RenderedField>;
  /** The rendered type definitions, by name */
  public readonly types = new Map<string, TypeDefinition>();

  constructor(private readonly db: SpecDatabase, resource: Resource) {
    const tagProperty = resource.tagInformation?.tagPropertyName;

    this.properties = mapValues(resource.properties, (prop, name) => {
      const history = new RichTypedField(prop).types();
      // Later types are rendered as unused types for backwards compatibility, except for tags
      for (const type of name === tagProperty ? history.slice(0, 1) : history) {
        this.addTypes(type);
      }
      return { type: history[0], required: name !== tagProperty && !!prop.required };
    });
    this.attributes = mapValues(resource.attributes, (attr) => {
      const type = new RichTypedField(attr).types()[0];
      this.addTypes(type);
      return { type, required: false };
    });
    for (const { entity } of db.follow('usesType', resource)) {
      if (entity.mustRenderForBwCompat) {
        this.addTypeDefinition(entity);
      }
    }
  }

  public field(typeDef: TypeDefinition, name: string): RenderedField | undefined {
    const prop = typeDef.properties[name];
    return prop ? { type: new RichTypedField(prop).types()[0], required: !!prop.required } : undefined;
  }

  private addTypes(type: PropertyType) {
    for (const typeDef of referencedTypeDefinitions(this.db, type)) {
      this.addTypeDefinition(typeDef);
    }
  }

  private addTypeDefinition(typeDef: TypeDefinition) {
    if (this.types.has(typeDef.name)) {
      return;
    }
    this.types.set(typeDef.name, typeDef);
    for (const prop of Object.values(typeDef.properties)) {
      this.addTypes(new RichTypedField(prop).types()[0]);
    }
  }
}

interface RenderedField {
  readonly type: PropertyType;
  readonly required: boolean;
}

class ResourceComparison {
  private readonly changes = new Array<L1Change>();
  private readonly releasedView: L1View;
  private readonly currentView: L1View;
  /** Current type definitions at the positions of each released type definition (by released id) */
  private readonly paired: Map<string, Set<TypeDefinition>>;

  constructor(
    private readonly released: SpecDatabase,
    private readonly releasedResource: Resource,
    private readonly current: SpecDatabase,
    private readonly currentResource: Resource,
  ) {
    this.releasedView = new L1View(released, releasedResource);
    this.currentView = new L1View(current, currentResource);
    this.paired = pairTypeDefinitions(released, releasedResource, current, currentResource);
  }

  public compare(): L1Change[] {
    for (const bag of ['properties', 'attributes'] as const) {
      const kind = bag === 'properties' ? 'property' : 'attribute';
      for (const [name, field] of Object.entries(this.releasedView[bag])) {
        const element = `${kind} ${name}`;
        const currentField = this.currentView[bag][name];
        if (!currentField) {
          this.report('cloudformation-change', element, 'removed');
        } else {
          this.compareField(element, field, currentField, this.currentResource[bag][name]);
        }
      }
      for (const name of Object.keys(this.currentView[bag])) {
        if (!this.releasedView[bag][name]) {
          this.report('addition', `${kind} ${name}`, 'added');
        }
      }
    }

    for (const [name, releasedType] of this.releasedView.types) {
      const currentType = this.currentView.types.get(name);
      if (currentType) {
        this.compareTypeDefinition(releasedType, currentType);
        continue;
      }
      const where = this.typesWithSameFields(releasedType, [...(this.paired.get(releasedType.$id) ?? [])]);
      if (where) {
        this.report('loss', `type ${name}`, `no longer rendered, but its fields ${where}`);
      } else {
        this.report('cloudformation-change', `type ${name}`, `removed (fields: ${fieldList(releasedType)})`);
      }
    }
    for (const name of this.currentView.types.keys()) {
      if (!this.releasedView.types.has(name)) {
        this.report('addition', `type ${name}`, 'added');
      }
    }

    return this.changes;
  }

  private compareTypeDefinition(releasedType: TypeDefinition, currentType: TypeDefinition) {
    for (const name of Object.keys(releasedType.properties)) {
      const element = `field ${releasedType.name}.${name}`;
      const releasedField = this.releasedView.field(releasedType, name)!;
      const currentField = this.currentView.field(currentType, name);
      if (currentField) {
        this.compareField(element, releasedField, currentField, currentType.properties[name]);
        continue;
      }
      const stillThere = [...(this.paired.get(releasedType.$id) ?? [])].filter((t) => t.properties[name]);
      if (stillThere.length > 0) {
        this.report('loss', element, `removed, but still exists in ${names(stillThere)}`);
      } else {
        this.report('cloudformation-change', element, 'removed from every current type');
      }
    }
    for (const name of Object.keys(currentType.properties)) {
      if (!releasedType.properties[name]) {
        this.report('addition', `field ${currentType.name}.${name}`, 'added');
      }
    }
  }

  /**
   * Compare the rendered type and requiredness of a property, attribute or field
   *
   * `currentHistory` is the current property, attribute or field, with all the types at its position. A changed type
   * is a loss if a type at the position has the same shape (see `matchShape`), with type definitions that are paired
   * with the released ones (see `pairTypeDefinitions`), and a released type definition is no longer rendered there.
   */
  private compareField(
    element: string,
    releasedField: RenderedField,
    currentField: RenderedField,
    currentHistory: Property | Attribute,
  ) {
    const releasedType = renderType(this.released, releasedField.type);
    const currentType = renderType(this.current, currentField.type);
    if (releasedType !== currentType) {
      const currentNames = new Set(referencedTypeDefinitions(this.current, currentField.type).map((t) => t.name));
      const renamedTo = new Map<TypeDefinition, Set<TypeDefinition>>();
      for (const type of new RichTypedField(currentHistory).types()) {
        const pairs = matchShape(this.released, releasedField.type, this.current, type, (r, c) => this.isPaired(r, c));
        for (const [releasedTypeDef, currentTypeDef] of pairs ?? []) {
          const candidates = renamedTo.get(releasedTypeDef) ?? new Set();
          renamedTo.set(releasedTypeDef, candidates.add(currentTypeDef));
        }
      }
      const lost = [...renamedTo]
        .filter(([t]) => !currentNames.has(t.name))
        .map(([t, candidates]) => this.typesWithSameFields(t, [...candidates]))
        .filter((where) => where !== undefined);

      const change = `type changed from ${releasedType} to ${currentType}`;
      if (lost.length > 0) {
        this.report('loss', element, `${change}, but the fields of the released type ${lost.join('; ')}`);
      } else {
        this.report('cloudformation-change', element, change);
      }
    }

    if (releasedField.required !== currentField.required) {
      this.report(
        'cloudformation-change',
        element,
        currentField.required ? 'is now required' : 'is no longer required',
      );
    }
  }

  private isPaired(releasedType: TypeDefinition, currentType: TypeDefinition) {
    return !!this.paired.get(releasedType.$id)?.has(currentType);
  }

  /**
   * Describe where the fields of a released type definition still exist, or undefined if they do not
   */
  private typesWithSameFields(releasedType: TypeDefinition, candidates: TypeDefinition[]): string | undefined {
    const fields = Object.keys(releasedType.properties);
    const matches = candidates
      .map((t) => ({ name: t.name, shared: fields.filter((f) => t.properties[f]) }))
      .filter((m) => m.shared.length > 0 || (fields.length === 0 && candidates.length > 0));
    if (matches.length === 0) {
      return undefined;
    }
    return matches.map((m) => `${m.shared.join(', ') || '(none)'} still exist in ${m.name}`).join('; ');
  }

  private report(kind: L1ChangeKind, element: string, description: string) {
    this.changes.push({ kind, resource: this.releasedResource.cloudFormationType, element, description });
  }
}

/**
 * The type as the L1 renders it, with type definitions by name
 *
 * Integers and numbers are the same in L1 code, and allowed values are not rendered.
 */
function renderType(db: SpecDatabase, type: PropertyType): string {
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

function fieldList(typeDef: TypeDefinition) {
  return Object.keys(typeDef.properties).join(', ') || 'none';
}

function names(typeDefs: TypeDefinition[]) {
  return typeDefs.map((t) => t.name).join(', ');
}

function mapValues<A, B>(xs: Record<string, A>, fn: (x: A, key: string) => B): Record<string, B> {
  return Object.fromEntries(Object.entries(xs).map(([k, x]) => [k, fn(x, k)]));
}
