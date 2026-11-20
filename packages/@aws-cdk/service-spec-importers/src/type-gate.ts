import { TypeHistoryResult, UndecidedCase, UndecidedKind } from './importers/import-type-history';

export interface TypeGateOptions {
  /** The mapping file that decides the undecided cases, as the printed text names it */
  readonly mappingFile: string;
  /** The version of the released database the build kept the types of */
  readonly baselineVersion: string;
}

export interface TypeGate {
  /** Whether the matcher left a case undecided */
  readonly failed: boolean;
  /** The whole gate output */
  readonly report: string;
  /** The undecided cases, each with the mapping entries that decide it */
  readonly entries: string;
}

const WHY: Record<UndecidedKind, string> = {
  'no-pair': 'has no pair: no current type at its position shares a field with it',
  ambiguous: 'has ambiguous candidates: more than one current type at its position shares a field with it',
  diverging: 'diverges: the positions where it keeps its name need different fields',
  interdependent:
    'is interdependent: whether it follows CloudFormation depends on other types, and the rounds do not settle',
};

/**
 * The type history gate: it fails exactly when the matcher left a released type undecided, and reports the rest
 */
export function typeGate(result: TypeHistoryResult, options: TypeGateOptions): TypeGate {
  const failed = result.undecided.length > 0;
  const entries = result.undecided.map((c) => formatUndecided(c, options.mappingFile)).join('\n\n');

  const lines = [
    `Type history gate against the released database ${options.baselineVersion}: ${
      failed ? `FAIL (${result.undecided.length} undecided)` : 'OK'
    }`,
  ];
  if (failed) {
    lines.push('', entries);
  }
  const section = <A>(title: string, items: A[], format: (item: A) => string) => {
    if (items.length > 0) {
      lines.push('', title, ...items.map((item) => `  ${format(item)}`));
    }
  };
  section(
    'Settled renames, merges and splits (the L1 keeps the released names):',
    result.settled,
    (s) => `${s.resource}: ${s.kind} ${s.releasedType} -> ${s.newTypes.join(', ')} (${s.positions.join(', ')})`,
  );
  section(
    "Merged and split types that follow CloudFormation's types (type breaks):",
    result.switched,
    (s) => `${s.resource}: ${s.releasedType} -> ${s.newType} (${s.positions.join(', ')})`,
  );
  section(
    "Tag properties that follow CloudFormation's type (type breaks):",
    result.tagBreaks,
    (b) => `${b.resource}: ${b.position}: ${b.releasedType} -> ${b.newType}`,
  );
  section(
    'Weak matches (settled renames, merges and splits sharing fewer than half of the released fields):',
    result.weak,
    (w) => {
      const share = `shares ${w.shared} of ${w.total} released fields`;
      return `${w.resource}: ${w.releasedType} -> ${w.newType} ${share} (${w.positions.join(', ')})`;
    },
  );
  section(`Applied entries of ${options.mappingFile}:`, result.applied, ({ entry, positions }) => {
    const { resource, kind, oldType, newTypes } = entry;
    return `${resource}: ${kind} ${oldType} -> ${newTypes.join(', ') || '-'} (${positions.join(', ')})`;
  });
  section(
    `Entries of ${options.mappingFile} that apply nowhere (reported only):`,
    result.inactive,
    (i) => `${i.entry.resource}: ${i.entry.kind} ${i.entry.oldType}: ${i.reason}`,
  );

  return { failed, report: lines.join('\n'), entries };
}

function formatUndecided(c: UndecidedCase, mappingFile: string) {
  return [
    `${c.resource}: ${c.releasedType} ${WHY[c.kind]}`,
    ...c.positions.map(
      (p) => `  ${p.position}: CloudFormation has ${p.cloudFormationType}, needs ${p.fields.join(', ')}`,
    ),
    `  Add one of these entries to ${mappingFile}:`,
    ...c.entries.map((e) => `    ${JSON.stringify(e)}`),
  ].join('\n');
}
