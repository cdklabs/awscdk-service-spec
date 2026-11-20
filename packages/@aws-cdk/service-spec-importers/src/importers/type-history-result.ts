import { TypeMapping } from '../type-mappings';

/**
 * Why the matcher cannot decide how a released type definition continues: the cases of "Type history gate" in README.md
 */
export type UndecidedKind = 'no-pair' | 'ambiguous' | 'diverging' | 'interdependent';

export interface TypePosition {
  /** Where the L1 renders the released type, for example `property Settings.Destination` */
  readonly position: string;
  /** CloudFormation's type there */
  readonly cloudFormationType: string;
  /** The fields the released type needs there */
  readonly fields: string[];
}

export interface UndecidedCase {
  readonly resource: string;
  readonly kind: UndecidedKind;
  readonly releasedType: string;
  readonly positions: TypePosition[];
  /** One entry per kind that resolves the case, with the reason and pull request link to fill in */
  readonly entries: TypeMapping[];
}

/**
 * A released type definition that CloudFormation renamed, merged or split, and that keeps its name in the L1
 */
export interface SettledChange {
  readonly resource: string;
  readonly kind: 'rename' | 'merge' | 'split';
  readonly releasedType: string;
  readonly newTypes: string[];
  readonly positions: string[];
}

/**
 * A weak match among the settled renames, merges and splits ("Type history gate" in README.md)
 */
export interface WeakMatch {
  readonly resource: string;
  readonly releasedType: string;
  readonly newType: string;
  /** Where CloudFormation renamed the released type to the current type */
  readonly positions: string[];
  /** The number of released fields that the current type has */
  readonly shared: number;
  /** The number of released fields */
  readonly total: number;
}

/**
 * A merged or split released type that now follows CloudFormation's type of another name, a reported type break
 */
export interface SwitchedType {
  readonly resource: string;
  readonly releasedType: string;
  /** The CloudFormation type the L1 renders instead */
  readonly newType: string;
  /** Where the L1 renders it */
  readonly positions: string[];
}

/**
 * A modern tag property whose type CloudFormation changed, a reported type break
 */
export interface TagTypeBreak {
  readonly resource: string;
  /** The tag property, for example `property Tags` */
  readonly position: string;
  /** The type the released L1 renders there */
  readonly releasedType: string;
  /** The type the L1 renders there now, CloudFormation's */
  readonly newType: string;
}

export interface AppliedMapping {
  readonly entry: TypeMapping;
  /** The positions the entry decided */
  readonly positions: string[];
}

export interface InactiveMapping {
  readonly entry: TypeMapping;
  /** Why it applies nowhere */
  readonly reason: string;
}

export interface TypeHistoryResult {
  readonly undecided: UndecidedCase[];
  readonly settled: SettledChange[];
  readonly weak: WeakMatch[];
  /** The merged and split types that follow CloudFormation's types */
  readonly switched: SwitchedType[];
  readonly tagBreaks: TagTypeBreak[];
  readonly applied: AppliedMapping[];
  readonly inactive: InactiveMapping[];
}
