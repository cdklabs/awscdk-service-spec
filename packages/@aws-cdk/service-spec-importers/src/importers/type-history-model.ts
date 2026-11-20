/**
 * The positions, uses, decisions and rounds of the type history, shared by its import, report and apply modules
 */
import { Attribute, Property, PropertyType, SpecDatabase, TypeDefinition } from '@aws-cdk/service-spec-types';
import { TypeHistoryResult, UndecidedKind } from './type-history-result';
import { renderType } from '../l1-view';
import { TypeMapping } from '../type-mappings';

export type Field = Property | Attribute;

/**
 * The fields a kept type definition gets; `source` is the field that types each
 */
export type FieldPlan = Array<{ name: string; required: boolean; source?: Field }>;

interface CurrentField {
  readonly typeDef: TypeDefinition;
  readonly name: string;
}

/**
 * A property, attribute or nested field that CloudFormation's newest types reach
 */
export interface CloudFormationPosition {
  readonly label: string;
  readonly field: Field;
  readonly within?: CurrentField;
}

/**
 * - `same`: CloudFormation's type there has the released name.
 * - `paired`: it has another name and pairs with the released type.
 * - `not-a-type`: it has another shape, even inside lists and maps; also every unreached and mixins-only use.
 * - `no-pair`: it has the same shape, but no type definition at that place shares a field with the released one.
 * - `ambiguous`: more than one does.
 */
export type UseStatus = 'same' | 'paired' | 'not-a-type' | 'no-pair' | 'ambiguous';

/**
 * Where the history of a position lives: a resource property or attribute, or a field of a released type definition
 */
export interface Owner {
  readonly key: string;
  readonly bag?: 'properties' | 'attributes';
  readonly parent?: TypeDefinition;
  readonly name: string;
}

interface PositionBase {
  readonly label: string;
  /** Every type definition the current sources give this position */
  readonly currentTypes: TypeDefinition[];
  /** The use of the parent type definition this position is a field of */
  readonly parentUse?: Use;
  readonly uses: Use[];
}

/**
 * A position that both the released L1 and CloudFormation's types have
 */
export interface VisitedPosition extends PositionBase {
  readonly kind: 'visited';
  readonly owner: Owner;
  readonly releasedField: Field;
  readonly currentField: Field;
  /** CloudFormation's type here: the newest type of the current sources */
  readonly cfnType: PropertyType;
  /** Whether CloudFormation's type renders as the released newest type here, so CloudFormation did not change it */
  readonly typeUnchanged: boolean;
  /**
   * Whether the L1 renders the newest type of the history here (a changed modern tag property): CloudFormation's, or,
   * where the history already has it as an older type, the released newest one, uncompared
   */
  readonly rendersCloudFormation: boolean;
  readonly within?: undefined;
}

/**
 * A field of a kept released type definition that CloudFormation's types do not reach
 */
export interface UnreachedPosition extends PositionBase {
  readonly kind: 'unreached';
  readonly owner?: undefined;
  readonly releasedField?: undefined;
  readonly currentField?: undefined;
  readonly cfnType?: undefined;
  readonly within?: undefined;
}

/**
 * A position where CloudFormation uses a current type definition of a released name and the released L1 does not
 */
export interface CurrentOnlyPosition extends PositionBase {
  readonly kind: 'current-only';
  readonly owner?: undefined;
  readonly releasedField?: undefined;
  readonly currentField: Field;
  readonly cfnType: PropertyType;
  /** The current type definition and field it is, if a field */
  readonly within?: CurrentField;
}

export type Position = VisitedPosition | UnreachedPosition | CurrentOnlyPosition;

/**
 * A released type definition that the L1 renders at a position
 */
export interface Use {
  readonly released: TypeDefinition;
  readonly position: Position;
  /** The type definitions at the same place in CloudFormation's type, if it has the same shape */
  readonly candidates: TypeDefinition[];
  readonly status: UseStatus;
  /** CloudFormation's type definition there */
  readonly cfn?: TypeDefinition;
  /** Whether only the mixins render the released type here (at or below a modern tag property's oldest type) */
  readonly mixinsOnly?: boolean;
}

interface DecisionBase {
  /** The uses where the L1 renders the released type */
  readonly stays: Use[];
  /** The uses whose position renders CloudFormation's type instead */
  readonly follows: Use[];
  /** The fields of the released type in the L1 */
  readonly fields: string[];
}

/**
 * `switched`: the rule for merged and split types makes the released type follow CloudFormation. `undecided`: the
 * gate fails for it.
 */
export type Decision =
  | (DecisionBase & { readonly kind: 'kept' | 'switched' })
  | (DecisionBase & { readonly kind: 'undecided'; readonly undecided: UndecidedKind })
  | (DecisionBase & {
      readonly kind: 'entry';
      readonly entry: TypeMapping;
      /** The uses the entry decided */
      readonly matched: Use[];
    });

/**
 * One round of decisions, all from the same positions that count
 */
export interface Round {
  /** The positions that count */
  readonly active: ReadonlySet<Position>;
  /** The current type definitions that several released ones continue as */
  readonly mergeTargets: ReadonlySet<TypeDefinition>;
  /** The released type definitions that follow CloudFormation by the merge and split rule */
  readonly switched: ReadonlySet<TypeDefinition>;
  readonly decisions: ReadonlyMap<TypeDefinition, Decision>;
  /** Each current field the L1 renders, by `fieldKey()`, with the first place it renders it */
  readonly renderedFields: ReadonlyMap<string, string>;
}

/**
 * A round before its rendered fields are known
 */
export type DecidedRound = Omit<Round, 'renderedFields'>;

/**
 * The fields a released type definition needs at one of its positions (rule 3)
 */
export function need(use: Use): string[] {
  const releasedFields = Object.keys(use.released.properties);
  // Without a paired CloudFormation type, exactly the released fields
  if (!use.cfn) {
    return releasedFields;
  }
  const stillThere = releasedFields.filter((name) => use.position.currentTypes.some((t) => t.properties[name]));
  return unique([...Object.keys(use.cfn.properties), ...stillThere]);
}

/**
 * The uses that decide a released type's fields and requiredness: those aws-cdk-lib renders, or all where it renders
 * none. cfn-property-mixins renders every field optional, so a use only it renders just needs its released fields
 * kept (`keepsMixinsFields()`).
 */
export function constrainingUses(uses: Use[]): Use[] {
  const lib = uses.filter((u) => !u.mixinsOnly);
  return lib.length > 0 ? lib : uses;
}

/**
 * Whether `fields` include what each mixins-only use needs
 */
export function keepsMixinsFields(uses: Use[], fields: string[]) {
  return uses.filter((u) => u.mixinsOnly).every((u) => need(u).every((name) => fields.includes(name)));
}

export function staysIn(round: DecidedRound, use: Use) {
  return !!round.decisions.get(use.released)?.stays.includes(use);
}

export function followsIn(round: DecidedRound, use: Use) {
  return !!round.decisions.get(use.released)?.follows.includes(use);
}

export function sameRenderedType(
  released: SpecDatabase,
  db: SpecDatabase,
  releasedType: PropertyType,
  cfnType: PropertyType,
) {
  return renderType(released, releasedType) === renderType(db, cfnType);
}

/**
 * Report a mapping entry that applies nowhere, with the reason
 */
export function reportInactive(result: TypeHistoryResult, entry: TypeMapping, reason: string) {
  result.inactive.push({ entry, reason });
}

export function setTypeHistory(field: Field, types: PropertyType[]) {
  field.type = types[types.length - 1];
  if (types.length > 1) {
    field.previousTypes = types.slice(0, -1);
  } else {
    delete field.previousTypes;
  }
}

export function setRequired(field: Field, required: boolean) {
  if (required) {
    (field as Property).required = true;
  } else {
    delete (field as Property).required;
  }
}

/**
 * The `Owner.key` of a field of a released type definition
 */
export function ownerKey(parent: TypeDefinition, name: string) {
  return `${parent.$id} ${name}`;
}

export function isUnpaired(use: Use): use is Use & { readonly status: 'no-pair' | 'ambiguous' } {
  return use.status === 'no-pair' || use.status === 'ambiguous';
}

/**
 * The released fields of a type definition, followed by the other names
 */
export function releasedAnd(releasedType: TypeDefinition, names: string[]): string[] {
  return unique([...Object.keys(releasedType.properties), ...names]);
}

export function pushTo<K, V>(map: Map<K, V[]>, key: K, ...values: V[]) {
  const list = map.get(key);
  if (list) {
    list.push(...values);
  } else {
    map.set(key, values);
  }
}

/**
 * The visited positions that count under a round, by the field whose history they share (`Owner.key`)
 */
export function positionsByField(positions: readonly Position[], round: DecidedRound): Map<string, VisitedPosition[]> {
  const byField = new Map<string, VisitedPosition[]>();
  for (const position of positions) {
    if (position.kind === 'visited' && round.active.has(position)) {
      pushTo(byField, position.owner.key, position);
    }
  }
  return byField;
}

/**
 * The types that the positions of one field need: CloudFormation's where a use follows it, `undefined` (the released
 * history) elsewhere. A field holds one type.
 */
export function neededTypes(db: SpecDatabase, round: DecidedRound, positions: VisitedPosition[]) {
  return unique(
    positions.map((p) => (p.uses.some((u) => followsIn(round, u)) ? renderType(db, p.cfnType) : undefined)),
  );
}

export function fieldKey({ typeDef, name }: CurrentField) {
  return `${typeDef.$id} ${name}`;
}

export function cloudFormationTypes(uses: Use[]): TypeDefinition[] {
  return unique(uses.map((u) => u.cfn).filter(isDefined));
}

export function hasNewField(releasedType: TypeDefinition, current: TypeDefinition) {
  return Object.keys(current.properties).some((name) => !releasedType.properties[name]);
}

export function sameSet(a: string[], b: string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

export function unique<A>(xs: A[]): A[] {
  return [...new Set(xs)];
}

export function insideContainers(type: PropertyType): PropertyType {
  return type.type === 'array' || type.type === 'map' ? insideContainers(type.element) : type;
}

export function last<A>(xs: A[]): A {
  return xs[xs.length - 1];
}

export function isDefined<A>(x: A | undefined): x is A {
  return x !== undefined;
}
