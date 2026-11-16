import {
  Property,
  PropertyType,
  Resource,
  RichPropertyType,
  RichTypedField,
  SpecDatabase,
  TypeDefinition,
} from '@aws-cdk/service-spec-types';
import { ref } from '@cdklabs/tskb';
import {
  Field,
  FieldPlan,
  followsIn,
  isDefined,
  last,
  ownerKey,
  Position,
  pushTo,
  Round,
  sameRenderedType,
  setRequired,
  setTypeHistory,
  Use,
  VisitedPosition,
} from './type-history-model';

/**
 * What applying one resource's type history reads and writes
 */
export interface TypeHistoryApplyContext {
  /** The database with the current sources, which the decisions are written into */
  readonly db: SpecDatabase;
  readonly released: SpecDatabase;
  readonly releasedResource: Resource;
  /** The resource in `db` */
  readonly resource: Resource;
  readonly positions: readonly Position[];
  readonly round: Round;
  readonly currentByName: ReadonlyMap<string, TypeDefinition>;
}

/**
 * Write one resource's last round of decisions into `db`
 */
export function applyTypeHistory(context: TypeHistoryApplyContext) {
  new TypeHistoryApplier(context).apply();
}

class TypeHistoryApplier {
  private readonly db: SpecDatabase;
  private readonly released: SpecDatabase;
  private readonly releasedResource: Resource;
  private readonly resource: Resource;
  private readonly positions: readonly Position[];
  private readonly round: Round;
  private readonly currentByName: ReadonlyMap<string, TypeDefinition>;
  /** The type definition in `db` for each kept released type definition (by released id) */
  private readonly targets = new Map<string, TypeDefinition>();

  constructor(context: TypeHistoryApplyContext) {
    this.db = context.db;
    this.released = context.released;
    this.releasedResource = context.releasedResource;
    this.resource = context.resource;
    this.positions = context.positions;
    this.round = context.round;
    this.currentByName = context.currentByName;
  }

  /**
   * Write the decisions into `db`, in this order: plan the kept types' fields from the current sources, before any of
   * their type definitions change, write them, put the released histories first, and carry the flags for backwards
   * compatibility
   */
  public apply() {
    const { plans, ownFields } = this.planFields();
    this.writeFields(plans);
    this.updateHistories(plans, ownFields);
    this.carryBwCompatFlags();
  }

  /**
   * The fields each kept type definition gets, with their requiredness and the field that types them
   *
   * `ownFields` holds the kept types whose target, the current type definition of their name, is a type the current
   * sources give one of their positions, so that its own fields are CloudFormation's there. Otherwise it describes
   * nothing the L1 renders as the kept type, and CloudFormation's types at the positions, or the release, type its
   * fields.
   */
  private planFields() {
    const plans = new Map<TypeDefinition, FieldPlan>();
    const ownFields = new Set<TypeDefinition>();
    for (const [releasedType, decision] of this.round.decisions) {
      if (decision.stays.length === 0) {
        continue;
      }
      const target = this.target(releasedType);
      const own = decision.stays.some((u) => u.position.currentTypes.includes(target));
      if (own) {
        ownFields.add(releasedType);
      }
      plans.set(
        releasedType,
        decision.fields.map((name) => {
          const atPositions = decision.stays.map((u) => this.fieldAt(u, name));
          // CloudFormation says nothing about a field its types do not reach, so the release decides there
          const releasedRequired = !!releasedType.properties[name]?.required;
          return {
            name,
            required: decision.stays.every((u, i) =>
              u.position.kind === 'unreached' ? releasedRequired : atPositions[i]?.required,
            ),
            source: (own ? target.properties[name] : undefined) ?? atPositions.find(isDefined),
          };
        }),
      );
    }
    return { plans, ownFields };
  }

  /**
   * Give each kept type definition its planned fields, and its released flag for backwards compatibility
   */
  private writeFields(plans: Map<TypeDefinition, FieldPlan>) {
    for (const [releasedType, plan] of plans) {
      const target = this.target(releasedType);
      for (const [name, field] of Object.entries(target.properties)) {
        const planned = plan.find((p) => p.name === name);
        // A field the released type does not have is CloudFormation's field at its positions
        if (!planned || (!releasedType.properties[name] && planned.source && planned.source !== field)) {
          delete target.properties[name];
        }
      }
      for (const { name, required, source } of plan) {
        if (!target.properties[name]) {
          const releasedField = releasedType.properties[name];
          const field = releasedField ? this.keptReleasedField(releasedField, source) : structuredClone(source!);
          if (!field) {
            continue;
          }
          target.properties[name] = field;
        }
        setRequired(target.properties[name], required);
      }
      if (releasedType.mustRenderForBwCompat) {
        target.mustRenderForBwCompat = true;
      }
    }
  }

  /**
   * Put the released histories first: at the positions that count, grouped by the field they are, and at the kept
   * released fields that no position reached
   */
  private updateHistories(plans: Map<TypeDefinition, FieldPlan>, ownFields: Set<TypeDefinition>) {
    const byOwner = new Map<string, VisitedPosition[]>();
    for (const position of this.positions) {
      if (position.kind === 'visited' && this.round.active.has(position)) {
        pushTo(byOwner, position.owner.key, position);
      }
    }
    for (const positions of byOwner.values()) {
      const { owner } = positions[0];
      const field = owner.bag
        ? this.resource[owner.bag][owner.name]
        : this.targets.get(owner.parent!.$id)?.properties[owner.name];
      if (field) {
        this.updateHistory(field, positions[0].releasedField, positions);
      }
    }
    // A kept released field that no position reached, for example below a position whose CloudFormation type has
    // another shape, keeps its released history too, followed by the type of the current type definition of its name
    // where that is a type the current sources give one of its positions
    for (const [releasedType, plan] of plans) {
      const target = this.target(releasedType);
      for (const { name } of plan) {
        const releasedField = releasedType.properties[name];
        const field = target.properties[name];
        // A field left out above, because nothing could give it a type, has no history to keep
        if (field && releasedField && !byOwner.has(ownerKey(releasedType, name))) {
          const cfnType = field.type;
          const typeUnchanged = sameRenderedType(this.released, this.db, releasedField.type, cfnType);
          const current = ownFields.has(releasedType)
            ? [{ currentField: field, cfnType, typeUnchanged, uses: [] }]
            : [];
          this.updateHistory(field, releasedField, current);
        }
      }
    }
  }

  /**
   * Keep the backwards compatibility flag of each released type definition that has it and that no decision covers,
   * on its type definition in `db` (decided ones get it in `writeFields`)
   */
  private carryBwCompatFlags() {
    for (const { entity } of this.released.follow('usesType', this.releasedResource)) {
      if (entity.mustRenderForBwCompat && !this.round.decisions.has(entity)) {
        const target = this.typeFor(entity);
        if (target) {
          target.mustRenderForBwCompat = true;
        }
      }
    }
  }

  /**
   * Put the released history first at the positions of one property, attribute or field (rules 1 and 2)
   *
   * The field is updated in place, because a nested read-only field is the same object as its attribute, and keeps
   * all its other details.
   */
  private updateHistory(
    field: Field,
    releasedField: Field,
    positions: Array<{ currentField: Field; cfnType: PropertyType; typeUnchanged: boolean; uses: Use[] }>,
  ) {
    const following = positions.find((p) => p.uses.some((u) => followsIn(this.round, u)));
    if (following) {
      setTypeHistory(field, [following.cfnType]);
      return;
    }

    const history = this.translateHistory(releasedField);
    if (history.length === 0) {
      return;
    }
    const rich = new RichTypedField({ type: last(history), previousTypes: history.slice(0, -1) });
    for (const position of positions.filter((p) => !p.typeUnchanged)) {
      rich.updateType(position.cfnType);
    }
    // A type that both have keeps the details of the current one, like its allowed values
    const currentTypes = positions.flatMap((p) => new RichTypedField(p.currentField).types());
    setTypeHistory(
      field,
      rich.types().map((t) => currentTypes.find((c) => new RichPropertyType(c).equals(t)) ?? t),
    );
  }

  /**
   * The field of CloudFormation's type at a use, or else of another current type at its position
   */
  private fieldAt(use: Use, name: string): Property | undefined {
    return use.cfn?.properties[name] ?? use.position.currentTypes.find((t) => t.properties[name])?.properties[name];
  }

  /**
   * A released field for a kept type definition, or undefined if neither its released types nor a current field can
   * give it a type
   */
  private keptReleasedField(releasedField: Field, current?: Field): Property | undefined {
    const field = structuredClone(releasedField);
    const history = this.translateHistory(releasedField);
    if (history.length === 0 && !current) {
      return undefined;
    }
    setTypeHistory(field, history.length > 0 ? history : new RichTypedField(current!).types());
    return field;
  }

  private translateHistory(field: Field): PropertyType[] {
    return new RichTypedField(field)
      .types()
      .map((t) => this.translate(t))
      .filter(isDefined);
  }

  /**
   * Translate a released type into the same type in `db`, or undefined if it refers to a type definition that is
   * not kept
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
        const target = this.typeFor(this.released.get('typeDefinition', type.reference));
        return target ? { type: 'ref', reference: ref(target) } : undefined;
      }
      default:
        return structuredClone(type);
    }
  }

  /**
   * The type definition in `db` for a released one, or undefined if the L1 no longer renders it
   *
   * A released type definition that follows CloudFormation at all its positions is CloudFormation's type of its name,
   * if there is one. A released type definition that is not rendered at a position the current sources have, like a
   * later type of a property's history, is kept as the current type of its name, or else as released.
   */
  private typeFor(releasedType: TypeDefinition): TypeDefinition | undefined {
    const existing = this.targets.get(releasedType.$id);
    if (existing) {
      return existing;
    }
    const decision = this.round.decisions.get(releasedType);
    if (decision) {
      return decision.stays.length > 0 ? this.target(releasedType) : this.currentByName.get(releasedType.name);
    }
    const sameName = this.currentByName.get(releasedType.name);
    if (sameName) {
      this.targets.set(releasedType.$id, sameName);
      return sameName;
    }
    const created = this.target(releasedType);
    for (const [name, field] of Object.entries(releasedType.properties)) {
      const history = this.translateHistory(field);
      if (history.length > 0) {
        const kept = structuredClone(field);
        setTypeHistory(kept, history);
        created.properties[name] = kept;
      }
    }
    return created;
  }

  /**
   * The type definition that keeps a released one: the current one of its name, or a new one
   */
  private target(releasedType: TypeDefinition): TypeDefinition {
    let target = this.targets.get(releasedType.$id);
    if (!target) {
      target =
        this.currentByName.get(releasedType.name) ??
        this.db.allocate('typeDefinition', {
          name: releasedType.name,
          documentation: releasedType.documentation,
          properties: {},
        });
      if (!this.currentByName.has(releasedType.name)) {
        this.db.link('usesType', this.resource, target);
      }
      this.targets.set(releasedType.$id, target);
    }
    return target;
  }
}
