import { emptyDatabase, Property, RichProperty, RichPropertyType, SpecDatabase } from '@aws-cdk/service-spec-types';
import {
  bool,
  divergingChecks,
  importLegacySpec,
  importRegistry,
  int,
  object,
  ref,
  RESOURCE,
  resourceTypeDefinition,
  str,
  strings,
} from './utils';
import { importTypeHistory, TypeHistoryResult, UndecidedCase } from '../src/importers/import-type-history';
import { compareL1, formatL1Changes } from '../src/l1-changes';
import { GeneratedPackage, L1View } from '../src/l1-view';
import { typeGate } from '../src/type-gate';
import { TypeMapping, TypeMappingKind } from '../src/type-mappings';
import { CloudFormationRegistryResource, jsonschema } from '../src/types';

const MAPPING_FILE = 'build/type-mappings.json';

let released: SpecDatabase;
let db: SpecDatabase;
beforeEach(() => {
  released = emptyDatabase();
  db = emptyDatabase();
});

describe('cases the matcher cannot decide fail the gate, and pass with the printed entry', () => {
  // Released Settings {Url, Port}; CloudFormation's Settings is Options {Name, Mode}, which shares no field
  const noPair = () => {
    importRegistry(released, {
      properties: { Settings: ref('Settings') },
      definitions: { Settings: object({ Url: str(), Port: int() }) },
    });
    importRegistry(db, {
      properties: { Settings: ref('Options') },
      definitions: { Options: object({ Name: str(), Mode: str() }) },
    });
  };

  test('a struct replaced by one that shares no field has no pair', () => {
    const first = runFresh(noPair);
    expect(cases(first)).toEqual(['no-pair Settings at property Settings']);
    expect(kinds(first.undecided[0])).toEqual(['rename', 'replace', 'keep-old', 'follow-cloudformation']);
    expect(gateFails(first)).toBe(true);

    const second = runFresh(noPair, [chosen(first, 'replace')]);
    expect(cases(second)).toEqual([]);
    expect(gateFails(second)).toBe(false);
    expect(history(resource(db).properties.Settings)).toEqual(['Options']);
    expect(l1Structs()).not.toContain('Settings');
  });

  test('two current types at one position that both pair are ambiguous candidates', () => {
    const setup = () => {
      importRegistry(released, {
        properties: { Target: { anyOf: [ref('Queue'), ref('Topic')] } },
        definitions: {
          Queue: object({ Arn: str() }),
          Topic: object({ Url: str() }),
        },
      });
      importRegistry(db, {
        properties: {
          Target: { anyOf: [ref('SqsTarget'), ref('SnsTarget')] },
        },
        definitions: {
          SqsTarget: object({ Arn: str(), Region: str() }),
          SnsTarget: object({ Arn: str(), Url: str() }),
        },
      });
    };

    const first = runFresh(setup);
    expect(cases(first)).toEqual(['ambiguous Queue at property Target']);
    expect(first.undecided[0].entries.map((e) => `${e.kind} ${e.newTypes.join(',')}`)).toEqual([
      'rename SnsTarget',
      'rename SqsTarget',
      'keep-old SnsTarget,SqsTarget',
      'follow-cloudformation SnsTarget,SqsTarget',
    ]);

    const rename = first.undecided[0].entries.find((e) => e.kind === 'rename' && e.newTypes[0] === 'SqsTarget')!;
    const second = runFresh(setup, [fill(rename)]);
    expect(cases(second)).toEqual([]);
    expect(history(resource(db).properties.Target)[0]).toEqual('Queue | Topic');
    expect(fields('Queue')).toEqual({ Arn: 'string', Region: 'string' });
    expect(fields('Topic')).toEqual({ Arn: 'string', Url: 'string' });
  });

  test('a shared type whose positions need different fields, with one CloudFormation type among them, diverges', () => {
    // CloudFormation's Settings is now any JSON, so the kept Settings.Target keeps exactly the released fields of
    // OldTarget, while CloudFormation's OldTarget at Other has other fields: neither a merge nor a split
    const setup = () => {
      importRegistry(released, {
        properties: { Settings: ref('Settings'), Other: ref('OldTarget') },
        definitions: { Settings: object({ Target: ref('OldTarget') }), OldTarget: arn() },
      });
      importRegistry(db, {
        properties: { Settings: {}, Other: ref('OldTarget') },
        definitions: { OldTarget: object({ Arn: str(), State: str() }) },
      });
    };

    const first = runFresh(setup);
    expect(cases(first)).toEqual(['diverging OldTarget at property Other, property Settings.Target']);
    expect(first.undecided[0].positions).toEqual([
      { position: 'property Other', cloudFormationType: 'OldTarget', fields: ['Arn', 'State'] },
      { position: 'property Settings.Target', cloudFormationType: 'no type', fields: ['Arn'] },
    ]);
    expect(kinds(first.undecided[0])).toEqual(['keep-old', 'follow-cloudformation']);
    expect(gateFails(first)).toBe(true);
    expect(switched(first)).toEqual([]);

    const second = runFresh(setup, [chosen(first, 'keep-old')]);
    expect(cases(second)).toEqual([]);
    expect(fields('OldTarget')).toEqual({ Arn: 'string', State: 'string' });
  });

  test('a split that follows CloudFormation diverges where the positions that keep its name need different fields', () => {
    // Third follows Other, while First keeps CloudFormation's Shared, with Mode, and Second, now any JSON, keeps
    // exactly the released fields
    importRegistry(released, {
      properties: {
        First: ref('Shared'),
        Second: ref('Shared'),
        Third: ref('Shared'),
      },
      definitions: { Shared: object({ Url: str() }) },
    });
    importRegistry(db, {
      properties: { First: ref('Shared'), Second: {}, Third: ref('Other') },
      definitions: {
        Shared: object({ Url: str(), Mode: str() }),
        Other: object({ Url: str(), Port: int() }),
      },
    });

    const result = run();

    expect(cases(result)).toEqual(['diverging Shared at property First, property Second, property Third']);
    expect(gateFails(result)).toBe(true);
    expect(switched(result)).toEqual([]);
    expect(history(resource(db).properties.Third)[0]).toEqual('Shared');
  });

  test('the printed entries are complete and the gate writes them', () => {
    const result = runFresh(noPair);
    const output = gate(result);

    expect(output.failed).toBe(true);
    expect(output.entries).toContain(`${RESOURCE}: Settings has no pair`);
    expect(output.entries).toContain(`Add one of these entries to ${MAPPING_FILE}:`);
    for (const entry of result.undecided[0].entries) {
      expect(output.entries).toContain(JSON.stringify(entry));
      expect(Object.keys(entry)).toEqual(['resource', 'oldType', 'newTypes', 'kind', 'reason', 'pr']);
    }
    expect(output.report).toContain('Type history gate against the released database 1.2.3: FAIL (1 undecided)');
    expect(output.report).toContain(output.entries);
  });
});

describe('settled changes pass the gate', () => {
  test('a rename that adds an optional field keeps the released name with the new field', () => {
    importRegistry(released, {
      properties: { Settings: ref('SettingsRequest') },
      definitions: { SettingsRequest: object({ Url: str() }) },
    });
    importRegistry(db, {
      properties: { Settings: ref('Settings') },
      definitions: { Settings: object({ Url: str(), Port: int() }) },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(history(resource(db).properties.Settings)).toEqual(['SettingsRequest', 'Settings']);
    expect(fields('SettingsRequest')).toEqual({ Url: 'string', Port: 'integer' });
    expect(settled(result)).toEqual(['rename SettingsRequest -> Settings at property Settings']);
  });

  test('a kept type at a position whose CloudFormation type did not change carries its new fields', () => {
    // As Batch PodProperties.Metadata, which renders Metadata while CloudFormation has EksMetadata
    importRegistry(released, {
      properties: { Pod: ref('Pod') },
      definitions: { Pod: object({ Metadata: ref('Metadata') }), Metadata: labels() },
    });
    importRegistry(released, {
      properties: { Pod: ref('Pod') },
      definitions: { Pod: object({ Metadata: ref('EksMetadata') }), EksMetadata: labels() },
    });
    importRegistry(db, {
      properties: { Pod: ref('Pod') },
      definitions: {
        Pod: object({ Metadata: ref('EksMetadata') }),
        EksMetadata: object({ Labels: map(), Namespace: str(), Annotations: map() }),
      },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(history(typeDefinition('Pod').properties.Metadata)).toEqual(['Metadata', 'EksMetadata']);
    expect(fields('Metadata')).toEqual({
      Labels: 'Map<string, string>',
      Namespace: 'string',
      Annotations: 'Map<string, string>',
    });
  });

  test('two released types merged into one with the same fields keep their names', () => {
    importRegistry(released, {
      properties: { Burn: ref('BurnSettings'), Dvb: ref('DvbSettings') },
      definitions: {
        BurnSettings: object({ Font: str() }),
        DvbSettings: object({ Font: str() }),
      },
    });
    importRegistry(db, {
      properties: { Burn: ref('BurnDvbSettings'), Dvb: ref('BurnDvbSettings') },
      definitions: { BurnDvbSettings: object({ Font: str() }) },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(switched(result)).toEqual([]);
    expect(history(resource(db).properties.Burn)[0]).toEqual('BurnSettings');
    expect(history(resource(db).properties.Dvb)[0]).toEqual('DvbSettings');
    expect(settled(result)).toEqual([
      'merge BurnSettings -> BurnDvbSettings at property Burn',
      'merge DvbSettings -> BurnDvbSettings at property Dvb',
    ]);
  });

  test('two released types merged into one that lost a field keep their names without it', () => {
    importRegistry(released, {
      properties: { First: ref('A'), Second: ref('B') },
      definitions: {
        A: object({ Url: str(), Port: int() }),
        B: object({ Url: str(), Port: int() }),
      },
    });
    importRegistry(db, {
      properties: { First: ref('C'), Second: ref('C') },
      definitions: { C: object({ Url: str() }) },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(switched(result)).toEqual([]);
    expect(settled(result)).toEqual(['merge A -> C at property First', 'merge B -> C at property Second']);
    expect(history(resource(db).properties.First)[0]).toEqual('A');
    expect(history(resource(db).properties.Second)[0]).toEqual('B');
    expect(fields('A')).toEqual({ Url: 'string' });
    expect(fields('B')).toEqual({ Url: 'string' });
    expect(compareL1(released, db).removed.map((c) => c.element)).toEqual(['field A.Port', 'field B.Port']);
  });

  test('a shared released type split into types that lost a field keeps its name without it', () => {
    importRegistry(released, {
      properties: { First: ref('Shared'), Second: ref('Shared') },
      definitions: { Shared: object({ Url: str(), Port: int() }) },
    });
    importRegistry(db, {
      properties: { First: ref('FirstSettings'), Second: ref('SecondSettings') },
      definitions: {
        FirstSettings: object({ Url: str() }),
        SecondSettings: object({ Url: str() }),
      },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(switched(result)).toEqual([]);
    expect(history(resource(db).properties.First)[0]).toEqual('Shared');
    expect(history(resource(db).properties.Second)[0]).toEqual('Shared');
    expect(fields('Shared')).toEqual({ Url: 'string' });
    expect(compareL1(released, db).removed.map((c) => c.element)).toEqual(['field Shared.Port']);
  });

  test('a shared released type split into types with the same fields keeps its name', () => {
    importRegistry(released, {
      properties: { First: ref('Shared'), Second: ref('Shared') },
      definitions: { Shared: object({ Url: str() }) },
    });
    importRegistry(db, {
      properties: { First: ref('FirstSettings'), Second: ref('SecondSettings') },
      definitions: {
        FirstSettings: object({ Url: str() }),
        SecondSettings: object({ Url: str() }),
      },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(switched(result)).toEqual([]);
    expect(history(resource(db).properties.First)[0]).toEqual('Shared');
    expect(history(resource(db).properties.Second)[0]).toEqual('Shared');
    expect(settled(result)).toEqual([
      'split Shared -> FirstSettings, SecondSettings at property First, property Second',
    ]);
  });

  test('a rename that shares one field of five keeps the released name and drops the other fields', () => {
    importRegistry(released, {
      properties: { Settings: ref('Old') },
      definitions: {
        Old: object({
          A: str(),
          B: str(),
          C: str(),
          D: str(),
          E: str(),
        }),
      },
    });
    importRegistry(db, {
      properties: { Settings: ref('New') },
      definitions: { New: object({ A: str(), X: str() }) },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(fields('Old')).toEqual({ A: 'string', X: 'string' });
    expect(compareL1(released, db).removed.map((c) => c.element)).toEqual([
      'field Old.B',
      'field Old.C',
      'field Old.D',
      'field Old.E',
    ]);
  });

  test('a revert to the released name keeps the released type', () => {
    importRegistry(released, {
      properties: { Settings: ref('Settings') },
      definitions: { Settings: object({ Url: str() }) },
    });
    importRegistry(released, {
      properties: { Settings: ref('SettingsV2') },
      definitions: { SettingsV2: object({ Url: str() }) },
    });
    importRegistry(db, {
      properties: { Settings: ref('Settings') },
      definitions: { Settings: object({ Url: str() }) },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(history(resource(db).properties.Settings)).toEqual(['Settings', 'SettingsV2']);
    expect(l1Changes()).toEqual([]);
  });

  test('a container or primitive change at a kept position keeps the released type rendered', () => {
    importRegistry(released, {
      properties: { Settings: ref('Settings'), Count: str() },
      definitions: { Settings: object({ Url: str() }) },
    });
    importRegistry(db, {
      properties: {
        Settings: { type: 'array', items: ref('Settings') },
        Count: int(),
      },
      definitions: { Settings: object({ Url: str() }) },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(history(resource(db).properties.Settings)).toEqual(['Settings', 'Array<Settings>']);
    expect(history(resource(db).properties.Count)).toEqual(['string', 'integer']);
    expect(l1Changes()).toEqual([]);
  });

  test('a resource, property, nested field and attribute that CloudFormation removed leave the L1, reported', () => {
    importRegistry(released, {
      properties: {
        Kept: str(),
        Removed: str(),
        Settings: ref('Settings'),
        Arn: str(),
      },
      definitions: { Settings: object({ Url: str(), Gone: str() }) },
      readOnlyProperties: ['/properties/Arn'],
    });
    importRegistry(released, { properties: { Name: str() } }, 'AWS::Some::Removed');
    importRegistry(db, {
      properties: { Kept: str(), Settings: ref('Settings') },
      definitions: { Settings: object({ Url: str() }) },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(Object.keys(resource(db).properties)).toEqual(['Kept', 'Settings']);
    expect(fields('Settings')).toEqual({ Url: 'string' });
    expect(compareL1(released, db).removed.map((c) => `${c.resource} ${c.element}`)).toEqual([
      'AWS::Some::Removed resource',
      `${RESOURCE} attribute Arn`,
      `${RESOURCE} field Settings.Gone`,
      `${RESOURCE} property Removed`,
    ]);
  });

  test('an entry naming types the current sources lack applies nowhere and is reported', () => {
    importRegistry(released, {
      properties: { Settings: ref('Settings') },
      definitions: { Settings: object({ Url: str() }) },
    });
    importRegistry(db, {
      properties: { Settings: ref('Settings') },
      definitions: { Settings: object({ Url: str() }) },
    });
    const entries = [
      mapping({ resource: 'AWS::Some::Missing', oldType: 'Settings', newTypes: ['Other'], kind: 'rename' }),
      mapping({ resource: RESOURCE, oldType: 'Settings', newTypes: ['NotYetThere'], kind: 'replace' }),
    ];

    const result = run(entries);

    expect(cases(result)).toEqual([]);
    expect(result.inactive.map((i) => `${i.entry.resource} ${i.entry.oldType}: ${i.reason}`)).toEqual([
      'AWS::Some::Missing Settings: the current sources do not have AWS::Some::Missing',
      `${RESOURCE} Settings: the current sources do not have NotYetThere`,
    ]);
    expect(history(resource(db).properties.Settings)).toEqual(['Settings']);
    expect(gateFails(result)).toBe(false);
  });

  test('a json property that CloudFormation now types as a string follows the json-to-string rule', () => {
    importRegistry(released, { properties: { Policy: {} } });
    importRegistry(db, { properties: { Policy: str() } });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(history(resource(db).properties.Policy)).toEqual(['string']);
  });

  test('a released type that only the released database still describes is kept', () => {
    importRegistry(released, {
      properties: { Settings: ref('SettingsRequest') },
      definitions: { SettingsRequest: object({ Url: str() }) },
    });
    importRegistry(released, {
      properties: { Settings: ref('Settings') },
      definitions: { Settings: object({ Url: str() }) },
    });
    importRegistry(db, {
      properties: { Settings: ref('Settings') },
      definitions: { Settings: object({ Url: str() }) },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(history(resource(db).properties.Settings)).toEqual(['SettingsRequest', 'Settings']);
    expect(l1Changes()).toEqual([]);
  });
});

describe('merged and split types that gain a field or no longer fit follow CloudFormation, a reported type break', () => {
  describe('two released types merged into one that gains a field both switch to it', () => {
    const before: Partial<CloudFormationRegistryResource> = {
      properties: { First: ref('A'), Second: ref('B') },
      definitions: { A: object({ Url: str() }), B: object({ Url: str() }) },
    };
    const merged = (fieldsOfC: jsonschema.ObjectProperties, required?: string[]) => ({
      properties: { First: ref('C'), Second: ref('C') },
      definitions: { C: object(fieldsOfC, required) },
    });

    test('in the build that merges them', () => {
      importRegistry(released, before);
      importRegistry(db, merged({ Url: str(), X: str() }, ['X']));

      const result = run();

      expect(cases(result)).toEqual([]);
      expect(gateFails(result)).toBe(false);
      expect(settled(result)).toEqual([]);
      expect(switched(result)).toEqual(['A -> C at property First', 'B -> C at property Second']);
      expect(history(resource(db).properties.First)).toEqual(['C']);
      expect(history(resource(db).properties.Second)).toEqual(['C']);
      expect(fields('C')).toEqual({ Url: 'string', X: 'string (required)' });
      expect(l1Structs()).toEqual(['C']);
      expect(l1Renames()).toEqual(['A, B -> C at property First, property Second']);
    });

    test('in a later build whose released database has the merge', () => {
      importRegistry(released, before);
      importRegistry(db, merged({ Url: str() }));
      run();
      const baseline = emptyDatabase();
      baseline.load(JSON.parse(JSON.stringify(db.save())));

      released = baseline;
      db = emptyDatabase();
      importRegistry(db, merged({ Url: str(), X: str() }, ['X']));
      const result = run();

      expect(cases(result)).toEqual([]);
      expect(gateFails(result)).toBe(false);
      expect(switched(result)).toEqual(['A -> C at property First', 'B -> C at property Second']);
      expect(history(resource(db).properties.First)).toEqual(['C']);
      expect(history(resource(db).properties.Second)).toEqual(['C']);
      expect(fields('C')).toEqual({ Url: 'string', X: 'string (required)' });
      expect(l1Renames()).toEqual(['A, B -> C at property First, property Second']);
    });

    test('unless a merge entry for each keeps their names', () => {
      importRegistry(released, before);
      importRegistry(db, merged({ Url: str(), X: str() }, ['X']));

      const result = run([
        mapping({ resource: RESOURCE, oldType: 'A', newTypes: ['C'], kind: 'merge' }),
        mapping({ resource: RESOURCE, oldType: 'B', newTypes: ['C'], kind: 'merge' }),
      ]);

      expect(cases(result)).toEqual([]);
      expect(switched(result)).toEqual([]);
      expect(applied(result)).toEqual(['merge A', 'merge B']);
      expect(history(resource(db).properties.First)).toEqual(['A', 'C']);
      expect(history(resource(db).properties.Second)).toEqual(['B', 'C']);
      expect(fields('A')).toEqual({ Url: 'string', X: 'string (required)' });
      expect(fields('B')).toEqual({ Url: 'string', X: 'string (required)' });
      expect(l1Renames()).toEqual([]);
    });
  });

  test('a merge entry for the merged type that lacks the field keeps only that one, and the other switches', () => {
    importRegistry(released, {
      properties: { First: ref('A'), Second: ref('B') },
      definitions: {
        A: object({ Url: str() }),
        B: object({ Url: str(), Mode: str() }),
      },
    });
    importRegistry(db, {
      properties: { First: ref('C'), Second: ref('C') },
      definitions: { C: object({ Url: str(), Mode: str() }) },
    });

    const result = run([mapping({ resource: RESOURCE, oldType: 'A', newTypes: ['C'], kind: 'merge' })]);

    expect(cases(result)).toEqual([]);
    expect(applied(result)).toEqual(['merge A']);
    expect(switched(result)).toEqual(['B -> C at property Second']);
    expect(history(resource(db).properties.First)).toEqual(['A', 'C']);
    expect(history(resource(db).properties.Second)).toEqual(['C']);
    expect(fields('A')).toEqual({ Url: 'string', Mode: 'string' });
  });

  test('every split type that gains the same field switches at its own position', () => {
    importRegistry(released, {
      properties: { First: ref('Shared'), Second: ref('Shared') },
      definitions: { Shared: object({ Url: str() }) },
    });
    importRegistry(db, {
      properties: { First: ref('FirstSettings'), Second: ref('SecondSettings') },
      definitions: {
        FirstSettings: object({ Url: str(), X: str() }),
        SecondSettings: object({ Url: str(), X: str() }),
      },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(gateFails(result)).toBe(false);
    expect(switched(result)).toEqual([
      'Shared -> FirstSettings at property First',
      'Shared -> SecondSettings at property Second',
    ]);
    expect(history(resource(db).properties.First)).toEqual(['FirstSettings']);
    expect(history(resource(db).properties.Second)).toEqual(['SecondSettings']);
    expect(l1Renames()).toEqual([
      'Shared -> FirstSettings at property First',
      'Shared -> SecondSettings at property Second',
    ]);
  });

  test('every merged type switches when the merged type has a field that one of them lacks', () => {
    importRegistry(released, {
      properties: { First: ref('A'), Second: ref('B') },
      definitions: {
        A: object({ Url: str(), Port: int() }),
        B: object({ Url: str() }),
      },
    });
    importRegistry(db, {
      properties: { First: ref('C'), Second: ref('C') },
      definitions: { C: object({ Url: str(), Port: int() }) },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(switched(result)).toEqual(['A -> C at property First', 'B -> C at property Second']);
    expect(history(resource(db).properties.First)).toEqual(['C']);
    expect(history(resource(db).properties.Second)).toEqual(['C']);
    expect(l1Renames()).toEqual(['A, B -> C at property First, property Second']);
  });

  test('a merged type keeps its name where CloudFormation keeps it', () => {
    importRegistry(released, {
      properties: {
        First: ref('FirstSettings'),
        Second: ref('SecondSettings'),
        Third: ref('FirstSettings'),
      },
      definitions: {
        FirstSettings: object({ Url: str() }),
        SecondSettings: object({ Url: str() }),
      },
    });
    importRegistry(db, {
      properties: {
        First: ref('Settings'),
        Second: ref('Settings'),
        Third: ref('FirstSettings'),
      },
      definitions: {
        Settings: object({ Url: str(), Port: int() }),
        FirstSettings: object({ Url: str() }),
      },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(gateFails(result)).toBe(false);
    expect(switched(result)).toEqual([
      'FirstSettings -> Settings at property First',
      'SecondSettings -> Settings at property Second',
    ]);
    expect(history(resource(db).properties.First)).toEqual(['Settings']);
    expect(history(resource(db).properties.Second)).toEqual(['Settings']);
    expect(history(resource(db).properties.Third)).toEqual(['FirstSettings']);
    expect(fields('FirstSettings')).toEqual({ Url: 'string' });
    expect(l1Renames()).toEqual(['FirstSettings, SecondSettings -> Settings at property First, property Second']);
  });

  test('a merge with nothing new follows CloudFormation where one of its types also belongs to a merge that switches', () => {
    // A and B merge into C, which has X that A lacks, so A and B switch; B and F also merge into D, which has nothing
    // new for either, so F switches only because B does
    importRegistry(released, {
      properties: { First: ref('A'), Second: ref('B'), Third: ref('B'), Fourth: ref('F') },
      definitions: {
        A: object({ Url: str() }),
        B: object({ Url: str(), X: str() }),
        F: object({ Url: str(), X: str() }),
      },
    });
    importRegistry(db, {
      properties: { First: ref('C'), Second: ref('C'), Third: ref('D'), Fourth: ref('D') },
      definitions: { C: object({ Url: str(), X: str() }), D: object({ Url: str(), X: str() }) },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(switched(result)).toEqual([
      'A -> C at property First',
      'B -> C at property Second',
      'B -> D at property Third',
      'F -> D at property Fourth',
    ]);
    expect(history(resource(db).properties.Fourth)).toEqual(['D']);
  });

  test('a released type merged with one whose split follows CloudFormation follows it too', () => {
    // A is split into C and D, and D has Port; B is merged with A into C, which has nothing new
    importRegistry(released, {
      properties: {
        First: ref('A'),
        Second: ref('B'),
        Third: ref('A'),
      },
      definitions: { A: object({ Url: str() }), B: object({ Url: str() }) },
    });
    importRegistry(db, {
      properties: {
        First: ref('C'),
        Second: ref('C'),
        Third: ref('D'),
      },
      definitions: {
        C: object({ Url: str() }),
        D: object({ Url: str(), Port: int() }),
      },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(switched(result)).toEqual([
      'A -> C at property First',
      'A -> D at property Third',
      'B -> C at property Second',
    ]);
    expect(history(resource(db).properties.Second)).toEqual(['C']);
  });

  test('a split position whose type gains a field renders it, and a position CloudFormation kept keeps its name', () => {
    importRegistry(released, {
      properties: { First: ref('Shared'), Second: ref('Shared') },
      definitions: { Shared: object({ Url: str() }) },
    });
    importRegistry(db, {
      properties: { First: ref('Shared'), Second: ref('SecondSettings') },
      definitions: {
        Shared: object({ Url: str() }),
        SecondSettings: object({ Url: str(), Port: int() }),
      },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(gateFails(result)).toBe(false);
    expect(switched(result)).toEqual(['Shared -> SecondSettings at property Second']);
    expect(history(resource(db).properties.First)).toEqual(['Shared']);
    expect(history(resource(db).properties.Second)).toEqual(['SecondSettings']);
    expect(fields('Shared')).toEqual({ Url: 'string' });
    expect(fields('SecondSettings')).toEqual({ Url: 'string', Port: 'integer' });
    expect(l1Renames()).toEqual(['Shared -> SecondSettings at property Second']);
  });

  test('a split whose positions CloudFormation all renamed renders its types where one gains a field', () => {
    importRegistry(released, {
      properties: { First: ref('Shared'), Second: ref('Shared') },
      definitions: { Shared: object({ Url: str() }) },
    });
    importRegistry(db, {
      properties: { First: ref('FirstSettings'), Second: ref('SecondSettings') },
      definitions: {
        FirstSettings: object({ Url: str() }),
        SecondSettings: object({ Url: str(), Port: int() }),
      },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(gateFails(result)).toBe(false);
    expect(switched(result)).toEqual([
      'Shared -> FirstSettings at property First',
      'Shared -> SecondSettings at property Second',
    ]);
    expect(history(resource(db).properties.First)).toEqual(['FirstSettings']);
    expect(history(resource(db).properties.Second)).toEqual(['SecondSettings']);
    expect(l1Structs()).toEqual(['FirstSettings', 'SecondSettings']);
    expect(l1Renames()).toEqual([
      'Shared -> FirstSettings at property First',
      'Shared -> SecondSettings at property Second',
    ]);
  });

  describe('a split whose only other position is below a type that switches is a plain rename', () => {
    // X is at Second and at Q.Inner; T switches to T2 at Q, so the L1 does not render Q.Inner and X is renamed at
    // Second only
    // With a new field, Z makes X a split that gains one; without, X's positions need different fields
    const setup = (withT: boolean, zFields: jsonschema.ObjectProperties) => {
      importRegistry(released, {
        properties: {
          Second: ref('X'),
          ...(withT ? { Q: ref('T'), Q2: ref('T') } : {}),
        },
        definitions: {
          T: object({ Inner: ref('X'), Name: str() }),
          X: object({ Url: str(), Sub: ref('Leaf') }),
          Leaf: object({ A: str() }),
        },
      });
      importRegistry(db, {
        properties: {
          Second: ref('Y'),
          ...(withT ? { Q: ref('T2'), Q2: ref('T') } : {}),
        },
        definitions: {
          Y: object({ Url: str(), Sub: ref('Leaf2') }),
          Leaf2: object({ A: str(), B: str() }),
          T2: object({ Inner: ref('Z'), Name: str(), Extra: str() }),
          T: object({ Name: str() }),
          Z: object(zFields),
        },
      });
    };

    test.each([
      ['alone', false, true, []],
      ['below a type that switches, where X would gain a field there', true, true, ['T -> T2 at property Q']],
      ['below a type that switches, where X would need other fields there', true, false, ['T -> T2 at property Q']],
    ])('keeps the positions below it %s', (_, withT, zNew, switches) => {
      const url = { Url: str() };
      setup(withT as boolean, zNew ? { ...url, New: str() } : url);

      const result = run();

      expect(cases(result)).toEqual([]);
      expect(gateFails(result)).toBe(false);
      expect(switched(result)).toEqual(switches);
      expect(settled(result)).toEqual([
        'rename Leaf -> Leaf2 at property Second.Sub',
        'rename X -> Y at property Second',
      ]);
      expect(history(typeDefinition('X').properties.Sub)).toEqual(['Leaf', 'Leaf2']);
      expect(fields('Leaf')).toEqual({ A: 'string', B: 'string' });
    });
  });

  test('two splits that each switch only while the other does not are interdependent, and pass with an entry', () => {
    // A is split only where B stays (at PB.Inner), and B only where A stays (at PA.InnerB), so either one following
    // CloudFormation fits the rule, and the rule cannot choose
    const setup = () => {
      importRegistry(released, {
        properties: { PA: ref('A'), PB: ref('B') },
        definitions: {
          A: object({ Url: str(), InnerB: ref('B') }),
          B: object({ Name: str(), Inner: ref('A') }),
        },
      });
      importRegistry(db, {
        properties: { PA: ref('A1'), PB: ref('B1') },
        definitions: {
          A1: object({ Url: str(), InnerB: ref('B2') }),
          A2: object({ Url: str(), New: str(), InnerB: ref('B1') }),
          B1: object({ Name: str(), Inner: ref('A2') }),
          B2: object({ Name: str(), New: str(), Inner: ref('A1') }),
        },
      });
    };

    const first = runFresh(setup);
    expect(cases(first)).toEqual([
      'interdependent A at property PA, property PB.Inner',
      'interdependent B at property PA.InnerB, property PB',
    ]);
    expect(gateFails(first)).toBe(true);
    expect(gate(first).entries).toContain(`${RESOURCE}: A is interdependent`);

    const second = runFresh(setup, [chosen(first, 'keep-old')]);
    expect(cases(second)).toEqual([]);
    expect(switched(second)).toEqual(['B -> B1 at property PB', 'B -> B2 at property PA.InnerB']);
    expect(history(resource(db).properties.PA)[0]).toEqual('A');
  });

  test('types whose rounds do not settle are interdependent even where one answer fits, and pass with an entry', () => {
    // Node switches where Top.Child or Pt2.N counts, P where Top.Extra counts; only Node switching and P renamed fits,
    // but the rounds alternate between counting all three positions and none
    const setup = () => {
      importRegistry(released, {
        properties: { Top: ref('Node'), Pt2: ref('P') },
        definitions: {
          Node: object({
            Name: str(),
            Child: ref('Node'),
            Extra: ref('P'),
          }),
          P: object({ Name: str(), N: ref('Node') }),
        },
      });
      importRegistry(db, {
        properties: { Top: ref('NodeA'), Pt2: ref('PY') },
        definitions: {
          NodeA: object({
            Name: str(),
            Child: ref('NodeB'),
            Extra: ref('PX'),
          }),
          NodeB: object({ Name: str(), New: str() }),
          PX: object({ Name: str(), New: str() }),
          PY: object({ Name: str(), N: ref('NodeC') }),
          NodeC: object({ Name: str(), New: str() }),
        },
      });
    };

    const first = runFresh(setup);
    expect(cases(first)).toEqual([
      'interdependent Node at property Pt2.N, property Top, property Top.Child',
      'interdependent P at property Pt2, property Top.Extra',
    ]);
    expect(gateFails(first)).toBe(true);

    const second = runFresh(setup, [chosen(first, 'follow-cloudformation')]);
    expect(cases(second)).toEqual([]);
    expect(gateFails(second)).toBe(false);
    expect(settled(second)).toEqual(['rename P -> PY at property Pt2']);
    expect(history(resource(db).properties.Top)).toEqual(['NodeA']);
  });

  test('a type whose positions change only between earlier rounds of a longer cycle is interdependent too', () => {
    // S switches while PM.F counts, which drops PS.G; the split entry keeps V at PM only while PS.G counts, which
    // keeps PM.F and PM.K. The rounds go around four sets, and W at PM.K is in both of the last two.
    importRegistry(released, {
      properties: { PM: ref('V'), PS: ref('S'), PC: ref('V') },
      definitions: {
        V: object({ Name: str(), F: ref('S'), K: ref('W') }),
        S: object({ Name: str(), G: ref('V') }),
        W: object({ Z: str() }),
      },
    });
    importRegistry(db, {
      properties: { PM: ref('VM'), PS: ref('SC'), PC: ref('VC') },
      definitions: {
        VM: object({ Name: str(), F: ref('SX'), K: ref('W') }),
        SX: object({ Name: str(), NewS: str() }),
        SC: object({ Name: str(), G: ref('VB') }),
        VB: object({ Name: str(), F: str() }),
        VC: object({ K: ref('W') }),
        W: object({ Z: str() }),
      },
    });

    const result = run([mapping({ resource: RESOURCE, oldType: 'V', newTypes: ['VM'], kind: 'split' })]);

    expect(cases(result)).toEqual([
      'interdependent S at property PM.F, property PS, property PS.G.F',
      'interdependent V at property PC, property PM, property PS.G',
      'interdependent W at property PC.K, property PM.K',
    ]);
  });

  describe('a merge or split whose positions need different fields, with nothing new, also follows CloudFormation', () => {
    // Released Shared {Url, Port}; CloudFormation keeps Shared {Url, Port} at First and renames Second to a type
    // without Port
    const fewerFields = (extra: Partial<CloudFormationRegistryResource> = {}) => {
      importRegistry(released, {
        properties: { First: ref('Shared'), Second: ref('Shared') },
        definitions: { Shared: object({ Url: str(), Port: int() }) },
      });
      importRegistry(db, {
        properties: {
          First: ref('Shared'),
          Second: ref('SecondSettings'),
          ...extra.properties,
        },
        definitions: {
          Shared: object({ Url: str(), Port: int() }),
          SecondSettings: object({ Url: str() }),
          ...extra.definitions,
        },
      });
    };

    test('a shared type renamed at one position to a type with fewer fields follows CloudFormation', () => {
      fewerFields();

      const result = run();

      expect(cases(result)).toEqual([]);
      expect(gateFails(result)).toBe(false);
      expect(switched(result)).toEqual(['Shared -> SecondSettings at property Second']);
      expect(history(resource(db).properties.First)).toEqual(['Shared']);
      expect(history(resource(db).properties.Second)).toEqual(['SecondSettings']);
      expect(fields('Shared')).toEqual({ Url: 'string', Port: 'integer' });
      expect(fields('SecondSettings')).toEqual({ Url: 'string' });
      expect(l1Renames()).toEqual(['Shared -> SecondSettings at property Second']);
    });

    test('a merged released type whose positions lose different fields follows CloudFormation with the merge', () => {
      importRegistry(released, {
        properties: {
          First: ref('FirstSettings'),
          Second: ref('SecondSettings'),
          Third: ref('FirstSettings'),
        },
        definitions: {
          FirstSettings: object({ Url: str(), Port: int() }),
          SecondSettings: object({ Url: str(), Port: int() }),
        },
      });
      importRegistry(db, {
        properties: {
          First: ref('Settings'),
          Second: ref('Settings'),
          Third: ref('FirstSettings'),
        },
        definitions: {
          Settings: object({ Url: str() }),
          FirstSettings: object({ Url: str(), Port: int() }),
        },
      });

      const result = run();

      expect(cases(result)).toEqual([]);
      expect(gateFails(result)).toBe(false);
      expect(switched(result)).toEqual([
        'FirstSettings -> Settings at property First',
        'SecondSettings -> Settings at property Second',
      ]);
      expect(history(resource(db).properties.First)).toEqual(['Settings']);
      expect(history(resource(db).properties.Second)).toEqual(['Settings']);
      expect(history(resource(db).properties.Third)).toEqual(['FirstSettings']);
      expect(fields('FirstSettings')).toEqual({ Url: 'string', Port: 'integer' });
      expect(l1Renames()).toEqual(['FirstSettings, SecondSettings -> Settings at property First, property Second']);
    });

    test('a merged type whose other position CloudFormation made any JSON follows CloudFormation with the merge', () => {
      // A has one CloudFormation type, C, so only the merge makes it switch
      importRegistry(released, {
        properties: {
          First: ref('A'),
          Second: ref('B'),
          Third: ref('A'),
        },
        definitions: {
          A: object({ Url: str(), Port: int() }),
          B: object({ Url: str(), Port: int() }),
        },
      });
      importRegistry(db, {
        properties: { First: ref('C'), Second: ref('C'), Third: {} },
        definitions: { C: object({ Url: str() }) },
      });

      const result = run();

      expect(cases(result)).toEqual([]);
      expect(switched(result)).toEqual(['A -> C at property First', 'B -> C at property Second']);
      expect(history(resource(db).properties.Third)[0]).toEqual('A');
      expect(fields('A')).toEqual({ Url: 'string', Port: 'integer' });
      expect(l1Renames()).toEqual(['A, B -> C at property First, property Second']);
    });

    test('a type merged with one that has no pair keeps its name while that one is undecided', () => {
      // A has no pair at Third, so the gate fails for A, and B, merged with A into C, stays as it is
      importRegistry(released, {
        properties: {
          First: ref('A'),
          Second: ref('B'),
          Third: ref('A'),
        },
        definitions: {
          A: object({ Url: str(), Port: int() }),
          B: object({ Url: str(), Port: int() }),
        },
      });
      importRegistry(db, {
        properties: {
          First: ref('C'),
          Second: ref('C'),
          Third: ref('Options'),
        },
        definitions: { C: object({ Url: str() }), Options: object({ Name: str() }) },
      });

      const result = run();

      expect(cases(result)).toEqual(['no-pair A at property First, property Third']);
      expect(switched(result)).toEqual([]);
      expect(settled(result)).toEqual(['merge B -> C at property Second']);
      expect(history(resource(db).properties.Second)[0]).toEqual('B');
    });

    test('keeps the released name everywhere with a keep-old entry', () => {
      fewerFields();

      const result = run([
        mapping({ resource: RESOURCE, oldType: 'Shared', newTypes: ['SecondSettings'], kind: 'keep-old' }),
      ]);

      expect(cases(result)).toEqual([]);
      expect(switched(result)).toEqual([]);
      expect(applied(result)).toEqual(['keep-old Shared']);
      expect(history(resource(db).properties.Second)[0]).toEqual('Shared');
      expect(fields('Shared')).toEqual({ Url: 'string', Port: 'integer' });
      expect(l1Renames()).toEqual([]);
    });

    test('follows CloudFormation where its entry applies to none of its positions', () => {
      // The entry names Other, which CloudFormation uses at Third only, so it decides nothing for Shared
      fewerFields({
        properties: { Third: ref('Other') },
        definitions: { Other: object({ Name: str() }) },
      });

      const result = run([mapping({ resource: RESOURCE, oldType: 'Shared', newTypes: ['Other'], kind: 'rename' })]);

      expect(cases(result)).toEqual([]);
      expect(switched(result)).toEqual(['Shared -> SecondSettings at property Second']);
      expect(result.inactive.map((i) => i.reason)).toEqual(['Other stands at none of the positions of Shared']);
    });
  });

  describe('a shared type where one position of its newest types has a field the others lack', () => {
    // As IoT AuditCheckConfiguration in 0.1.227: the released C renders Check, but its newest type is already
    // CustomCheck
    const setup = () => {
      importRegistry(released, divergingChecks('Check'));
      importRegistry(released, divergingChecks('CustomCheck'));
      importRegistry(db, divergingChecks('CustomCheck'));
    };

    test('renders the type CloudFormation uses there, and the others keep the released name', () => {
      const result = runFresh(setup);

      expect(cases(result)).toEqual([]);
      expect(switched(result)).toEqual(['Check -> CustomCheck at property Checks.C']);
      expect(fields('Checks')).toEqual({ A: 'Check', B: 'Check', C: 'CustomCheck' });
      expect(fields('Check')).toEqual({ Enabled: 'boolean' });
      expect(l1Renames()).toEqual(['Check -> CustomCheck at property Checks.C']);

      const output = gate(result);
      expect(output.failed).toBe(false);
      expect(output.report).toContain(`  ${RESOURCE}: Check -> CustomCheck (property Checks.C)`);
    });

    test('keeps the released name everywhere with a keep-old entry', () => {
      const result = runFresh(setup, [
        mapping({ resource: RESOURCE, oldType: 'Check', newTypes: ['CustomCheck'], kind: 'keep-old' }),
      ]);

      expect(cases(result)).toEqual([]);
      expect(switched(result)).toEqual([]);
      expect(fields('Checks')).toEqual({ A: 'Check', B: 'Check', C: 'Check' });
      expect(fields('Check')).toEqual({ Enabled: 'boolean', Configuration: 'string' });
      expect(l1Renames()).toEqual([]);
    });
  });
});

describe('a kept type whose field needs different types at its positions follows CloudFormation, a type break', () => {
  // Released P {Name, F: N} at A and B; CloudFormation splits P into PA and PB, and N below into NA and NB, which
  // gain a field each, so N follows CloudFormation at A.F and B.F and one field P.F cannot hold both
  const nestedSplit = (
    order: Order,
    extraReleased: Partial<CloudFormationRegistryResource> = {},
    extraCurrent: Partial<CloudFormationRegistryResource> = {},
  ) => {
    importRegistry(
      released,
      inOrder(order, {
        properties: { A: ref('P'), B: ref('P'), ...extraReleased.properties },
        definitions: {
          P: object({ Name: str(), F: ref('N') }),
          N: object({ X: str() }),
          ...extraReleased.definitions,
        },
      }),
    );
    importRegistry(
      db,
      inOrder(order, {
        properties: { A: ref('PA'), B: ref('PB'), ...extraCurrent.properties },
        definitions: {
          PA: object({ Name: str(), F: ref('NA') }),
          PB: object({ Name: str(), F: ref('NB') }),
          NA: object({ X: str(), New: str() }),
          NB: object({ X: str(), Other: str() }),
          ...extraCurrent.definitions,
        },
      }),
    );
  };

  test('in either input order', () => {
    const outputs = ORDERS.map((order) => {
      const result = runFresh(() => nestedSplit(order));

      expect(cases(result)).toEqual([]);
      expect(gateFails(result)).toBe(false);
      expect(settled(result)).toEqual([]);
      expect(switched(result)).toEqual(['P -> PA at property A', 'P -> PB at property B']);
      expect(history(resource(db).properties.A)).toEqual(['PA']);
      expect(history(resource(db).properties.B)).toEqual(['PB']);
      expect(fields('PA')).toEqual({ Name: 'string', F: 'NA' });
      expect(fields('PB')).toEqual({ Name: 'string', F: 'NB' });
      expect(l1Structs()).toEqual(['NA', 'NB', 'PA', 'PB']);
      expect(l1Renames()).toEqual([
        'N -> NA at property A.F',
        'N -> NB at property B.F',
        'P -> PA at property A',
        'P -> PB at property B',
      ]);
      return runOutput(result);
    });
    expect(outputs[1]).toEqual(outputs[0]);
  });

  test('where CloudFormation keeps the nested type at one position', () => {
    importRegistry(released, {
      properties: { A: ref('P'), B: ref('P') },
      definitions: { P: object({ Name: str(), F: ref('N') }), N: object({ X: str() }) },
    });
    importRegistry(db, {
      properties: { A: ref('PA'), B: ref('PB') },
      definitions: {
        PA: object({ Name: str(), F: ref('NA') }),
        PB: object({ Name: str(), F: ref('N') }),
        NA: object({ X: str(), New: str() }),
        N: object({ X: str() }),
      },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(switched(result)).toEqual(['P -> PA at property A', 'P -> PB at property B']);
    expect(fields('PA')).toEqual({ Name: 'string', F: 'NA' });
    expect(fields('PB')).toEqual({ Name: 'string', F: 'N' });
  });

  test('where the nested type follows CloudFormation only once a later round leaves out one of its positions', () => {
    // T switches to T2 at Q, so Q.Inner, where N has no pair, counts only in the first round
    nestedSplit(
      'given',
      { properties: { Q: ref('T'), Q2: ref('T') }, definitions: { T: object({ Name: str(), Inner: ref('N') }) } },
      {
        properties: { Q: ref('T2'), Q2: ref('T') },
        definitions: {
          T2: object({ Name: str(), Inner: ref('Z'), Extra: str() }),
          T: object({ Name: str() }),
          Z: object({ Zz: str() }),
        },
      },
    );

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(switched(result)).toEqual(['P -> PA at property A', 'P -> PB at property B', 'T -> T2 at property Q']);
    expect(fields('PA')).toEqual({ Name: 'string', F: 'NA' });
    expect(fields('PB')).toEqual({ Name: 'string', F: 'NB' });
  });

  test('but not once the type above its other positions follows CloudFormation and leaves it one position', () => {
    // P.F needs NA at A and C.G, NB at B.G; T.H needs MB and MC. Once T switches, P counts only at A
    const outputs = ORDERS.map((order) => {
      const result = runFresh(() => {
        importRegistry(
          released,
          inOrder(order, {
            properties: { A: ref('P'), B: ref('T'), C: ref('T') },
            definitions: {
              P: object({ Name: str(), F: ref('N') }),
              T: object({ Name: str(), G: ref('P'), H: ref('M') }),
              N: object({ X: str() }),
              M: object({ Y: str() }),
            },
          }),
        );
        importRegistry(
          db,
          inOrder(order, {
            properties: { A: ref('PA'), B: ref('TB'), C: ref('TC') },
            definitions: {
              PA: object({ Name: str(), F: ref('NA') }),
              PB: object({ Name: str(), F: ref('NB') }),
              TB: object({ Name: str(), G: ref('PB'), H: ref('MB') }),
              TC: object({ Name: str(), G: ref('PA'), H: ref('MC') }),
              NA: object({ X: str(), New: str() }),
              NB: object({ X: str(), Other: str() }),
              MB: object({ Y: str(), New2: str() }),
              MC: object({ Y: str(), Other2: str() }),
            },
          }),
        );
      });

      expect(cases(result)).toEqual([]);
      expect(switched(result)).toEqual(['T -> TB at property B', 'T -> TC at property C']);
      expect(settled(result)).toEqual(['rename N -> NA at property A.F', 'rename P -> PA at property A']);
      expect(history(resource(db).properties.A)).toEqual(['P', 'PA']);
      expect(canonicalL1()).toContain('P { F: N <- NA; Name: string }');
      return runOutput(result);
    });
    expect(outputs[1]).toEqual(outputs[0]);
  });

  test('two that are each below the other both follow CloudFormation', () => {
    // P.F needs NA at A.F and NB at B.K.F, below T; T.H needs MA at A.G.H, below P, and MB at B.H
    const outputs = ORDERS.map((order) => {
      const result = runFresh(() => {
        importRegistry(
          released,
          inOrder(order, {
            properties: { A: ref('P'), B: ref('T') },
            definitions: {
              P: object({ Name: str(), F: ref('N'), G: ref('T') }),
              T: object({ Name: str(), H: ref('M'), K: ref('P') }),
              N: object({ X: str() }),
              M: object({ Y: str() }),
            },
          }),
        );
        importRegistry(
          db,
          inOrder(order, {
            properties: { A: ref('PA'), B: ref('TB') },
            definitions: {
              PA: object({ Name: str(), F: ref('NA'), G: ref('TA') }),
              PB: object({ Name: str(), F: ref('NB'), G: ref('TB') }),
              TA: object({ Name: str(), H: ref('MA'), K: ref('PA') }),
              TB: object({ Name: str(), H: ref('MB'), K: ref('PB') }),
              NA: object({ X: str(), New: str() }),
              NB: object({ X: str(), Other: str() }),
              MA: object({ Y: str(), New2: str() }),
              MB: object({ Y: str(), Other2: str() }),
            },
          }),
        );
      });

      expect(cases(result)).toEqual([]);
      // Their positions below each other no longer count
      expect(switched(result)).toEqual(['P -> PA at property A', 'T -> TB at property B']);
      expect(settled(result)).toEqual([]);
      return runOutput(result);
    });
    expect(outputs[1]).toEqual(outputs[0]);
  });

  test('an entry that keeps it fails the build, naming the field, unless an entry also keeps the nested type', () => {
    const keepOld = (oldType: string, newTypes: string[]) =>
      mapping({ resource: RESOURCE, oldType, newTypes, kind: 'keep-old' });

    expect(() => runFresh(() => nestedSplit('given'), [keepOld('P', ['PA', 'PB'])])).toThrow(
      `${RESOURCE}: P.F needs NA, NB at its positions`,
    );

    const result = runFresh(() => nestedSplit('given'), [keepOld('P', ['PA', 'PB']), keepOld('N', ['NA', 'NB'])]);
    expect(cases(result)).toEqual([]);
    expect(history(typeDefinition('P').properties.F)).toEqual(['N', 'NA', 'NB']);
  });

  test('an entry that keeps it fails the build, naming a carried field that its positions give different types', () => {
    // Released P {Name} at A and B; CloudFormation's types there add G, a string at A and an integer at B
    const carried = (order: Order, typeAtA: string) => () => {
      importRegistry(
        released,
        inOrder(order, { properties: { A: ref('P'), B: ref('P') }, definitions: { P: object({ Name: str() }) } }),
      );
      importRegistry(
        db,
        inOrder(order, {
          properties: { A: ref(typeAtA), B: ref('PB') },
          definitions: {
            [typeAtA]: object({ Name: str(), G: str() }),
            PB: object({ Name: str(), G: int() }),
          },
        }),
      );
    };
    const keepOld = (newTypes: string[]) => [mapping({ resource: RESOURCE, oldType: 'P', newTypes, kind: 'keep-old' })];

    for (const order of ORDERS) {
      // Without an entry, P gains a field and follows CloudFormation at both positions
      const result = runFresh(carried(order, 'PA'));
      expect(gateFails(result)).toBe(false);
      expect(switched(result)).toEqual(['P -> PA at property A', 'P -> PB at property B']);

      const message = `${RESOURCE}: P.G needs number, string at its positions`;
      expect(() => runFresh(carried(order, 'PA'), keepOld(['PA', 'PB']))).toThrow(message);
      // Also where the kept type is CloudFormation's type at A, whose own field it would keep
      expect(() => runFresh(carried(order, 'P'), keepOld(['PB']))).toThrow(message);
    }
  });

  test('an undecided one keeps its released field type, and the gate fails', () => {
    // At C, CloudFormation's Z shares no field with P
    const result = runFresh(() =>
      nestedSplit(
        'given',
        { properties: { C: ref('P') } },
        { properties: { C: ref('Z') }, definitions: { Z: object({ Zz: str() }) } },
      ),
    );

    expect(cases(result)).toEqual(['no-pair P at property A, property B, property C']);
    expect(gateFails(result)).toBe(true);
    expect(history(typeDefinition('P').properties.F)).toEqual(['N', 'NA', 'NB']);
  });

  test('an undecided one carries a field that its positions give different types, and the gate fails', () => {
    // At C, CloudFormation's Z shares no field with P
    const outputs = ORDERS.map((order) => {
      const result = runFresh(() => {
        importRegistry(
          released,
          inOrder(order, {
            properties: { A: ref('P'), B: ref('P'), C: ref('P') },
            definitions: { P: object({ Name: str() }) },
          }),
        );
        importRegistry(
          db,
          inOrder(order, {
            properties: { A: ref('PA'), B: ref('PB'), C: ref('Z') },
            definitions: {
              PA: object({ Name: str(), G: str() }),
              PB: object({ Name: str(), G: int() }),
              Z: object({ Zz: str() }),
            },
          }),
        );
      });
      expect(cases(result)).toEqual(['no-pair P at property A, property B, property C']);
      expect(gateFails(result)).toBe(true);
      return history(typeDefinition('P').properties.G);
    });
    expect(outputs).toEqual([['integer'], ['integer']]);
  });

  test('only the mixins render it at the tag property: they keep it, with its released fields', () => {
    const tagStruct = (a: string, b: string) =>
      object({ Key: str(), Value: str(), A: ref(a), B: ref(b) }, ['Key', 'Value']);
    const outputs = ORDERS.map((order) => {
      const result = runFresh(() => {
        importRegistry(
          released,
          inOrder(order, {
            properties: { Tags: { type: 'array', items: ref('TagX') } as jsonschema.Schema },
            definitions: {
              TagX: tagStruct('P', 'P'),
              P: object({ Name: str(), F: ref('N') }),
              N: object({ X: str() }),
            },
          }),
        );
        importRegistry(
          db,
          inOrder(order, {
            properties: { Tags: { type: 'array', items: ref('TagY') } as jsonschema.Schema },
            definitions: {
              TagY: tagStruct('PA', 'PB'),
              PA: object({ Name: str(), F: ref('NA') }),
              PB: object({ Name: str(), F: ref('NB') }),
              NA: object({ X: str(), New: str() }),
              NB: object({ X: str(), Other: str() }),
            },
          }),
        );
      });

      expect([...cases(result), ...settled(result), ...switched(result)]).toEqual([]);
      expect(tagBreaks(result)).toEqual(['property Tags: Array<TagX> -> Array<TagY>']);
      expect(l1Structs()).toEqual(['NA', 'NB', 'PA', 'PB', 'TagY']);
      expect(canonicalL1('cfn-property-mixins').filter((line) => /^(TagX|P|N) /.test(line))).toEqual([
        'N { X: string }',
        'P { F: N; Name: string }',
        'TagX { A: P; B: P; Key: string; Value: string }',
      ]);
      return runOutput(result);
    });
    expect(outputs[1]).toEqual(outputs[0]);
  });
});

describe('the result does not depend on the input order', () => {
  test('a field of a kept split takes the types CloudFormation gives it at its positions in alphabetical order', () => {
    const outputs = ORDERS.map((order) => {
      runFresh(() => {
        importRegistry(
          released,
          inOrder(order, {
            properties: { A: ref('P'), B: ref('P'), C: ref('P') },
            definitions: { P: object({ Name: str(), F: str() }) },
          }),
        );
        importRegistry(
          db,
          inOrder(order, {
            properties: { A: ref('PA'), B: ref('PB'), C: ref('PC') },
            definitions: {
              PA: object({ Name: str(), F: int() }),
              PB: object({ Name: str(), F: bool() }),
              PC: object({ Name: str(), F: { type: 'number' } }),
            },
          }),
        );
      });
      return history(typeDefinition('P').properties.F);
    });
    // The L1 renders integer and number alike, but the history keeps both
    expect(outputs).toEqual([
      ['string', 'boolean', 'integer', 'number'],
      ['string', 'boolean', 'integer', 'number'],
    ]);
  });

  test('each current type keeps its own allowed values, and a new kept type takes those first in alphabetical order', () => {
    const outputs = ORDERS.map((order) => {
      runFresh(() => {
        importRegistry(
          released,
          inOrder(order, {
            properties: { A: ref('P'), B: ref('P') },
            definitions: { P: object({ Name: str(), F: int() }) },
          }),
        );
        importRegistry(
          db,
          inOrder(order, {
            properties: { A: ref('PA'), B: ref('PB') },
            definitions: {
              PA: object({ Name: str(), F: { type: 'string', enum: ['a', 'b'] } }),
              PB: object({ Name: str(), F: { type: 'string', enum: ['c'] } }),
            },
          }),
        );
      });
      // The kept field holds copies, so a later write to it leaves CloudFormation's types as they are
      expect(typeDefinition('P').properties.F.type).not.toBe(typeDefinition('PA').properties.F.type);
      return {
        PA: history(typeDefinition('PA').properties.F),
        PB: history(typeDefinition('PB').properties.F),
        P: history(typeDefinition('P').properties.F),
      };
    });
    expect(outputs[0]).toEqual({ PA: ['string<a|b>'], PB: ['string<c>'], P: ['integer', 'string<a|b>'] });
    expect(outputs[1]).toEqual(outputs[0]);
  });

  test("a kept type that is CloudFormation's type at one of its positions keeps that type's allowed values", () => {
    const properties = { A: ref('PA'), B: ref('PB'), C: ref('P') };
    const definitions = {
      PA: object({ Name: str(), F: { type: 'string', enum: ['a', 'b'] } }),
      PB: object({ Name: str(), F: { type: 'string', enum: ['c'] } }),
      P: object({ Name: str(), F: { type: 'string', enum: ['z'] } }),
    };
    const outputs = permutations(Object.keys(properties)).flatMap((propertyOrder) =>
      permutations(Object.keys(definitions)).map((definitionOrder) => {
        runFresh(() => {
          importRegistry(released, {
            properties: { A: ref('P'), B: ref('P'), C: ref('P') },
            definitions: { P: object({ Name: str(), F: int() }) },
          });
          importRegistry(db, {
            properties: inKeyOrder(properties, propertyOrder),
            definitions: inKeyOrder(definitions, definitionOrder),
          });
        });
        return ['PA', 'PB', 'P'].map((name) => `${name}.F: ${history(typeDefinition(name).properties.F).join(' <- ')}`);
      }),
    );
    expect(outputs).toEqual(Array(36).fill(['PA.F: string<a|b>', 'PB.F: string<c>', 'P.F: integer <- string<z>']));
  });

  test('a field that a kept type carries takes the allowed values of its positions in a fixed order', () => {
    const outputs = ORDERS.map((order) => {
      runFresh(() => {
        importRegistry(
          released,
          inOrder(order, { properties: { A: ref('P'), B: ref('P') }, definitions: { P: object({ Name: str() }) } }),
        );
        importRegistry(
          db,
          inOrder(order, {
            properties: { A: ref('PA'), B: ref('PB') },
            definitions: {
              PA: object({ Name: str(), G: { type: 'string', enum: ['g1'] } }),
              PB: object({ Name: str(), G: { type: 'string', enum: ['g2'] } }),
            },
          }),
        );
      }, [mapping({ resource: RESOURCE, oldType: 'P', newTypes: ['PA', 'PB'], kind: 'keep-old' })]);
      return history(typeDefinition('P').properties.G);
    });
    expect(outputs).toEqual([['string<g1>'], ['string<g1>']]);
  });

  test('a field that a kept type carries from positions of the same type takes the details of the first by path', () => {
    const properties = { A: ref('PA'), B: ref('PB') };
    const definitions = {
      PA: object({ Name: str(), G: { type: 'string', description: 'doc at A' } }),
      PB: object({ Name: str(), G: { type: 'string', description: 'another doc at B' } }),
    };
    const outputs = ORDERS.flatMap((releasedOrder) =>
      permutations(Object.keys(properties)).flatMap((propertyOrder) =>
        permutations(Object.keys(definitions)).map((definitionOrder) => {
          runFresh(() => {
            importRegistry(
              released,
              inOrder(releasedOrder, {
                properties: { A: ref('P'), B: ref('P') },
                definitions: { P: object({ Name: str() }) },
              }),
            );
            importRegistry(db, {
              properties: inKeyOrder(properties, propertyOrder),
              definitions: inKeyOrder(definitions, definitionOrder),
            });
          }, [mapping({ resource: RESOURCE, oldType: 'P', newTypes: ['PA', 'PB'], kind: 'keep-old' })]);
          const { G } = typeDefinition('P').properties;
          return `${history(G).join(' <- ')}: ${G.documentation}`;
        }),
      ),
    );
    expect(outputs).toEqual(Array(8).fill('string: doc at A'));
  });

  test('a field that a kept type carries from two positions at one path takes the details first in alphabetical order', () => {
    // Both members of the union reach P at property Target.X
    const target = (order: Order) => ({ anyOf: order === 'given' ? [ref('A'), ref('B')] : [ref('B'), ref('A')] });
    const outputs = ORDERS.flatMap((releasedOrder) =>
      ORDERS.map((order) => {
        runFresh(() => {
          importRegistry(
            released,
            inOrder(releasedOrder, {
              properties: { Target: target(releasedOrder) },
              definitions: {
                A: object({ Arn: str(), X: ref('P') }),
                B: object({ Url: str(), X: ref('P') }),
                P: object({ Name: str() }),
              },
            }),
          );
          importRegistry(
            db,
            inOrder(order, {
              properties: { Target: target(order) },
              definitions: {
                A: object({ Arn: str(), X: ref('PA') }),
                B: object({ Url: str(), X: ref('PB') }),
                PA: object({ Name: str(), G: { type: 'string', description: 'doc one' } }),
                PB: object({ Name: str(), G: { type: 'string', description: 'doc two' } }),
              },
            }),
          );
        }, [mapping({ resource: RESOURCE, oldType: 'P', newTypes: ['PA', 'PB'], kind: 'keep-old' })]);
        const { G } = typeDefinition('P').properties;
        return `${history(G).join(' <- ')}: ${G.documentation}`;
      }),
    );
    expect(outputs).toEqual(Array(4).fill('string: doc one'));
  });

  test('a kept field whose struct follows CloudFormation takes its type in alphabetical order where the types render alike', () => {
    // Q merges with R into QX, which gains a field, so Q follows CloudFormation at the kept P.F
    const outputs = ORDERS.flatMap((releasedOrder) =>
      ORDERS.map((order) => {
        const result = runFresh(() => {
          importRegistry(
            released,
            inOrder(releasedOrder, {
              properties: { A: ref('P'), B: ref('P'), C: ref('R') },
              definitions: {
                P: object({ Name: str(), F: { anyOf: [ref('Q'), str()] } }),
                Q: object({ X: str() }),
                R: object({ X: str() }),
              },
            }),
          );
          importRegistry(
            db,
            inOrder(order, {
              properties: { A: ref('PA'), B: ref('PB'), C: ref('QX') },
              definitions: {
                PA: object({ Name: str(), F: { anyOf: [str(), ref('QX')] } }),
                PB: object({ Name: str(), F: { anyOf: [ref('QX'), str()] } }),
                QX: object({ X: str(), New: str() }),
              },
            }),
          );
        });
        expect(switched(result)).toEqual(['Q -> QX at property A.F, property B.F', 'R -> QX at property C']);
        return history(typeDefinition('P').properties.F);
      }),
    );
    expect(outputs).toEqual(Array(4).fill(['QX | string']));
  });
});

describe('settled renames whose current type shares fewer than half of the released fields', () => {
  const setup = (releasedFields: string[], currentFields: string[]) => {
    importRegistry(released, {
      properties: { Settings: ref('Old') },
      definitions: { Old: object(strings(releasedFields)) },
    });
    importRegistry(db, {
      properties: { Settings: ref('New') },
      definitions: { New: object(strings(currentFields)) },
    });
  };

  test.each([
    ['one of five', ['A', 'B', 'C', 'D', 'E'], ['A', 'X'], '1 of 5'],
    ['two of five', ['A', 'B', 'C', 'D', 'E'], ['A', 'B', 'X'], '2 of 5'],
    ['none of a released type without fields', [], ['Url'], '0 of 0'],
  ])('are listed as weak matches when they share %s, and pass the gate', (_, releasedFields, currentFields, count) => {
    setup(releasedFields, currentFields);

    const result = run();

    expect(settled(result)).toEqual(['rename Old -> New at property Settings']);
    expect(result.weak).toEqual([
      {
        resource: RESOURCE,
        releasedType: 'Old',
        newType: 'New',
        positions: ['property Settings'],
        shared: Number(count.split(' of ')[0]),
        total: Number(count.split(' of ')[1]),
      },
    ]);
    const output = gate(result);
    expect(output.failed).toBe(false);
    expect(output.report).toContain(`  ${RESOURCE}: Old -> New shares ${count} released fields (property Settings)`);
  });

  test.each([
    ['all fields', ['A', 'B'], ['A', 'B']],
    ['exactly half', ['A', 'B', 'C', 'D'], ['A', 'B', 'X']],
  ])('are not listed when they share %s', (_, releasedFields, currentFields) => {
    setup(releasedFields, currentFields);

    const result = run();

    expect(settled(result)).toEqual(['rename Old -> New at property Settings']);
    expect(result.weak).toEqual([]);
    expect(gate(result).report).not.toContain('Weak');
  });

  test('are listed once per current type of a split', () => {
    importRegistry(released, {
      properties: { First: ref('Shared'), Second: ref('Shared') },
      definitions: { Shared: object(strings(['A', 'B', 'C', 'D', 'E'])) },
    });
    importRegistry(db, {
      properties: { First: ref('One'), Second: ref('Two') },
      // A new field would make the split follow CloudFormation's types instead
      definitions: { One: object(strings(['A'])), Two: object(strings(['A'])) },
    });

    const result = run();

    expect(settled(result)).toEqual(['split Shared -> One, Two at property First, property Second']);
    expect(
      result.weak.map((w) => `${w.releasedType} -> ${w.newType} ${w.shared} of ${w.total} at ${w.positions}`),
    ).toEqual(['Shared -> One 1 of 5 at property First', 'Shared -> Two 1 of 5 at property Second']);
  });

  test('are not listed when a mapping entry decides them', () => {
    setup(['A', 'B', 'C', 'D', 'E'], ['A', 'X']);

    const result = run([mapping({ resource: RESOURCE, oldType: 'Old', newTypes: ['New'], kind: 'rename' })]);

    expect(result.applied.map((a) => a.entry.kind)).toEqual(['rename']);
    expect(result.weak).toEqual([]);
  });
});

describe('requiredness follows CloudFormation', () => {
  test('a carried field that CloudFormation requires renders required', () => {
    importRegistry(released, {
      properties: { Settings: ref('Settings') },
      definitions: { Settings: object({ Url: str() }) },
    });
    importRegistry(db, {
      properties: { Settings: ref('Settings') },
      definitions: { Settings: object({ Url: str(), Port: int() }, ['Port']) },
    });

    run();

    expect(fields('Settings')).toEqual({ Url: 'string', Port: 'integer (required)' });
  });

  test('a kept field that became required renders required', () => {
    importRegistry(released, {
      properties: { Settings: ref('SettingsRequest') },
      definitions: { SettingsRequest: object({ Url: str() }) },
    });
    importRegistry(db, {
      properties: { Settings: ref('Settings') },
      definitions: { Settings: object({ Url: str() }, ['Url']) },
    });

    run();

    expect(fields('SettingsRequest')).toEqual({ Url: 'string (required)' });
  });

  test('a field of a shared type is required only where CloudFormation requires it at every position', () => {
    importRegistry(released, {
      properties: { First: ref('Shared'), Second: ref('Shared') },
      definitions: { Shared: object({ Url: str() }) },
    });
    importRegistry(db, {
      properties: { First: ref('FirstSettings'), Second: ref('SecondSettings') },
      definitions: {
        FirstSettings: object({ Url: str() }, ['Url']),
        SecondSettings: object({ Url: str() }),
      },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(fields('Shared')).toEqual({ Url: 'string' });
  });
});

describe('a kept struct below a list or map change', () => {
  const urlPort = () => object({ Url: str(), Port: int() });
  const urlMode = () => object({ Url: str(), Mode: str() }, ['Mode']);

  test('takes the fields of the struct CloudFormation put into a list', () => {
    importRegistry(released, {
      properties: { Settings: ref('Settings') },
      definitions: { Settings: urlPort() },
    });
    importRegistry(db, {
      properties: { Settings: { type: 'array', items: ref('Settings') } },
      definitions: { Settings: urlMode() },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(history(resource(db).properties.Settings)).toEqual(['Settings', 'Array<Settings>']);
    expect(fields('Settings')).toEqual({ Url: 'string', Mode: 'string (required)' });
    const changes = compareL1(released, db);
    expect(changes.addedFields.map((c) => c.element)).toEqual(['field Settings.Mode']);
    expect(changes.removed.map((c) => c.element)).toEqual(['field Settings.Port']);
  });

  test('takes the fields of the struct CloudFormation took out of a list', () => {
    importRegistry(released, {
      properties: { Settings: { type: 'array', items: ref('Settings') } },
      definitions: { Settings: urlPort() },
    });
    importRegistry(db, {
      properties: { Settings: ref('Settings') },
      definitions: { Settings: urlMode() },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(history(resource(db).properties.Settings)).toEqual(['Array<Settings>', 'Settings']);
    expect(fields('Settings')).toEqual({ Url: 'string', Mode: 'string (required)' });
  });

  test('takes the fields of the struct CloudFormation put into a map', () => {
    importRegistry(released, {
      properties: { Settings: ref('Settings') },
      definitions: { Settings: urlPort() },
    });
    importRegistry(db, {
      properties: {
        Settings: { type: 'object', patternProperties: { '.*': ref('Settings') } } as any,
      },
      definitions: { Settings: urlMode() },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(history(resource(db).properties.Settings)).toEqual(['Settings', 'Map<string, Settings>']);
    expect(fields('Settings')).toEqual({ Url: 'string', Mode: 'string (required)' });
  });

  test('keeps a released field that another current type at the position still has', () => {
    importRegistry(released, {
      properties: { Settings: ref('Settings') },
      definitions: { Settings: urlPort() },
    });
    // Another region still has the field in a struct outside a list
    importRegistry(
      db,
      { properties: { Settings: ref('OldSettings') }, definitions: { OldSettings: urlPort() } },
      RESOURCE,
      'region-1',
    );
    importRegistry(
      db,
      {
        properties: { Settings: { type: 'array', items: ref('Settings') } },
        definitions: { Settings: urlMode() },
      },
      RESOURCE,
      'region-2',
    );

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(history(resource(db).properties.Settings)[0]).toEqual('Settings');
    expect(fields('Settings')).toEqual({ Url: 'string', Port: 'integer', Mode: 'string (required)' });
    const changes = compareL1(released, db);
    expect(changes.addedFields.map((c) => c.element)).toEqual(['field Settings.Mode']);
    expect(changes.removed).toEqual([]);
  });

  test('keeps its released name when CloudFormation also renamed it', () => {
    importRegistry(released, {
      properties: { Settings: ref('Settings') },
      definitions: { Settings: urlPort() },
    });
    importRegistry(db, {
      properties: { Settings: { type: 'array', items: ref('NewSettings') } },
      definitions: { NewSettings: urlMode() },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(history(resource(db).properties.Settings)).toEqual(['Settings', 'Array<NewSettings>']);
    expect(fields('Settings')).toEqual({ Url: 'string', Mode: 'string (required)' });
    expect(settled(result)).toEqual(['rename Settings -> NewSettings at property Settings']);
  });

  test('renders a new field typed with a released name that CloudFormation gave another struct', () => {
    importRegistry(released, {
      properties: { Settings: ref('Settings'), Backup: ref('Dest') },
      definitions: {
        Settings: object({ Url: str() }),
        Dest: object({ Url: str(), Port: int() }),
      },
    });
    importRegistry(db, {
      properties: {
        Settings: { type: 'array', items: ref('Settings') },
        Backup: ref('DestRequest'),
      },
      definitions: {
        Settings: object({ Url: str(), Extra: ref('Dest') }),
        DestRequest: object({ Url: str(), Port: int() }),
        Dest: object({ State: str() }),
      },
    });

    const result = run();

    // The kept Settings renders Extra, so Dest is rendered there with CloudFormation's other fields: Dest is split
    // and gains State, so Backup renders DestRequest
    expect(fields('Settings')).toEqual({ Url: 'string', Extra: 'Dest' });
    expect(cases(result)).toEqual([]);
    expect(switched(result)).toEqual(['Dest -> DestRequest at property Backup']);
    expect(fields('Dest')).toEqual({ State: 'string' });
  });
});

describe('a kept struct below a union change', () => {
  test.each([
    ['reused by a field the L1 does not render', { Dest: object({ State: str() }) }],
    ['not reused', { Other: object({ State: str() }) }],
  ])('a rename stays settled where its released name is %s', (_, extraDefinition) => {
    // CloudFormation's Settings is now a union, so the kept Settings keeps exactly its released fields and the L1
    // does not render Extra
    const extraType = Object.keys(extraDefinition)[0];
    importRegistry(released, {
      properties: { Settings: ref('Settings'), Backup: ref('Dest') },
      definitions: {
        Settings: object({ Url: str() }),
        Dest: object({ Url: str(), Port: int() }),
      },
    });
    importRegistry(db, {
      properties: {
        Settings: { anyOf: [ref('Settings'), str()] },
        Backup: ref('DestRequest'),
      },
      definitions: {
        Settings: object({ Url: str(), Extra: ref(extraType) }),
        DestRequest: object({ Url: str(), Port: int() }),
        ...extraDefinition,
      },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(settled(result)).toEqual(['rename Dest -> DestRequest at property Backup']);
    expect(fields('Settings')).toEqual({ Url: 'string' });
    expect(history(resource(db).properties.Backup)).toEqual(['Dest', 'DestRequest']);
    expect(fields('Dest')).toEqual({ Url: 'string', Port: 'integer' });
  });

  describe('where CloudFormation gives the union a member of another name', () => {
    const settingsV2OrString: jsonschema.Schema = {
      anyOf: [ref('SettingsV2'), str()],
    } as any;
    const shapes: Array<[string, jsonschema.Schema]> = [
      ['a union', settingsV2OrString],
      ['a list of a union', { type: 'array', items: settingsV2OrString } as any],
      ['a map of a union', { type: 'object', patternProperties: { '.*': settingsV2OrString } } as any],
    ];
    const setup = (settings: jsonschema.Schema, nested: boolean, property = 'Top') => {
      const inOuter = (s: jsonschema.Schema): jsonschema.Schema => (nested ? ref('Outer') : s);
      const releasedSettings: jsonschema.Schema = ref('Settings');
      importRegistry(released, {
        properties: { [property]: inOuter(releasedSettings), Backup: ref('Dest') },
        definitions: {
          ...(nested ? { Outer: object({ Settings: releasedSettings }) } : {}),
          Settings: object({ Url: str() }),
          Dest: object({ Url: str(), Port: int() }),
        },
      });
      importRegistry(db, {
        properties: { [property]: inOuter(settings), Backup: ref('DestRequest') },
        definitions: {
          ...(nested ? { Outer: object({ Settings: settings }) } : {}),
          SettingsV2: object({ Url: str(), Extra: ref('Dest') }),
          DestRequest: object({ Url: str(), Port: int() }),
          Dest: object({ State: str() }),
        },
      });
    };

    test.each(shapes)('a rename stays settled where a field turns into %s', (_, settings) => {
      // The kept Outer renders the released Settings {Url} at Settings, and nothing renders SettingsV2
      setup(settings, true);

      const result = run();

      expect(new L1View(db, resource(db)).structs.has('SettingsV2')).toBe(false);
      expect(cases(result)).toEqual([]);
      expect(settled(result)).toEqual(['rename Dest -> DestRequest at property Backup']);
      expect(fields('Settings')).toEqual({ Url: 'string' });
      expect(fields('Dest')).toEqual({ Url: 'string', Port: 'integer' });
    });

    test.each(shapes)(
      'the released name is compared below the member where a property turns into %s',
      (_, settings) => {
        // A property renders the later types of its history as structs too, so the L1 renders SettingsV2 with Extra
        setup(settings, false);

        const result = run();

        expect(Object.keys(new L1View(db, resource(db)).structs.get('SettingsV2')!.properties)).toEqual([
          'Url',
          'Extra',
        ]);
        expect(cases(result)).toEqual([]);
        expect(switched(result)).toEqual(['Dest -> DestRequest at property Backup']);
        expect(fields('Dest')).toEqual({ State: 'string' });
      },
    );

    test('the released name is compared below the member where the tag property turns into a union', () => {
      // The modern tag property renders its newest type, the union, so SettingsV2 with Extra; the mixins add Settings
      setup(settingsV2OrString, false, 'Tags');

      const result = run();

      expect(resource(db).tagInformation?.tagPropertyName).toEqual('Tags');
      expect(Object.keys(new L1View(db, resource(db)).structs.get('SettingsV2')!.properties)).toEqual(['Url', 'Extra']);
      expect(new L1View(db, resource(db), 'cfn-property-mixins').structs.has('Settings')).toBe(true);
      expect(cases(result)).toEqual([]);
      expect(settled(result)).toEqual([]);
      expect(switched(result)).toEqual(['Dest -> DestRequest at property Backup']);
      expect(tagBreaks(result)).toEqual(['property Tags: Settings -> SettingsV2 | string']);
      expect(fields('Settings')).toEqual({ Url: 'string' });
      expect(fields('Dest')).toEqual({ State: 'string' });
    });
  });

  test.each([
    [
      'only below a field the L1 does not render',
      {},
      [],
      ['rename Dest -> DestRequest at property Backup'],
      { Url: 'string', Port: 'integer' },
    ],
    [
      // Other renders Mid, so the L1 renders Dest at Other.Inner with CloudFormation's other fields: Dest is split
      // and gains State, so Backup renders DestRequest
      'also at a property the L1 renders',
      { Other: ref('Mid') },
      ['Dest -> DestRequest at property Backup'],
      [],
      { State: 'string' },
    ],
  ])('a released name reused two levels below a union position is compared %s', (_, other, switches, renames, dest) => {
    // The kept Settings keeps exactly {Url}, so the L1 renders neither Extra nor Mid.Inner below it
    importRegistry(released, {
      properties: { Settings: ref('Settings'), Backup: ref('Dest') },
      definitions: {
        Settings: object({ Url: str() }),
        Dest: object({ Url: str(), Port: int() }),
      },
    });
    importRegistry(db, {
      properties: {
        Settings: { anyOf: [ref('Settings'), str()] },
        Backup: ref('DestRequest'),
        ...other,
      },
      definitions: {
        Settings: object({ Url: str(), Extra: ref('Mid') }),
        Mid: object({ Inner: ref('Dest') }),
        Dest: object({ State: str() }),
        DestRequest: object({ Url: str(), Port: int() }),
      },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(switched(result)).toEqual(switches);
    expect(settled(result)).toEqual(renames);
    expect(fields('Settings')).toEqual({ Url: 'string' });
    expect(fields('Dest')).toEqual(dest);
  });

  test('a case names the path where the L1 renders a struct, not one below a field it does not render', () => {
    // CloudFormation reaches Mid first through Settings.Extra, which the L1 does not render, and also through Other.W.
    // CloudFormation's Backup is any JSON, so the kept Backup keeps exactly the released fields of Dest.
    importRegistry(released, {
      properties: { Settings: ref('Settings'), Backup: ref('Dest') },
      definitions: {
        Settings: object({ Url: str() }),
        Dest: object({ Url: str(), Port: int() }),
      },
    });
    importRegistry(db, {
      properties: {
        Settings: { anyOf: [ref('Settings'), str()] },
        Backup: {},
        Other: ref('Wrap'),
      },
      definitions: {
        Settings: object({ Url: str(), Extra: ref('Mid') }),
        Wrap: object({ W: ref('Mid') }),
        Mid: object({ Inner: ref('Dest') }),
        Dest: object({ State: str() }),
      },
    });

    const result = run();

    expect(cases(result)).toEqual(['diverging Dest at property Backup, property Other.W.Inner']);
  });

  test('a renamed struct takes its new fields from CloudFormation where the L1 does not render its current namesake', () => {
    // CloudFormation's Dest is only below Settings.Extra, which the L1 does not render, so its X: Foo is nowhere in
    // the L1 and does not count for Foo
    importRegistry(released, {
      properties: {
        Settings: ref('Settings'),
        Backup: ref('Dest'),
        Other: ref('Foo'),
      },
      definitions: {
        Settings: object({ Url: str() }),
        Dest: object({ Url: str() }),
        Foo: object({ A: str(), B: str() }),
      },
    });
    importRegistry(db, {
      properties: {
        Settings: { anyOf: [ref('Settings'), str()] },
        Backup: ref('DestRequest'),
        Other: ref('FooRequest'),
      },
      definitions: {
        Settings: object({ Url: str(), Extra: ref('Dest') }),
        Dest: object({ Url: str(), X: ref('Foo') }),
        Foo: object({ A: str(), C: str() }),
        DestRequest: object({ Url: str(), X: str() }),
        FooRequest: object({ A: str() }),
      },
    });

    const result = run();

    expect(fields('Dest')).toEqual({ Url: 'string', X: 'string' });
    expect(cases(result)).toEqual([]);
    expect(settled(result)).toEqual([
      'rename Dest -> DestRequest at property Backup',
      'rename Foo -> FooRequest at property Other',
    ]);
    expect(fields('Foo')).toEqual({ A: 'string' });
  });
});

describe('released names below a changed position', () => {
  test('a struct renamed below a container change keeps its released name', () => {
    importRegistry(released, {
      properties: { Settings: ref('Settings') },
      definitions: { Settings: object({ Target: ref('OldTarget') }), OldTarget: arn() },
    });
    importRegistry(db, {
      properties: { Settings: { type: 'array', items: ref('Settings') } },
      definitions: { Settings: object({ Target: ref('NewTarget') }), NewTarget: arn() },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(history(resource(db).properties.Settings)).toEqual(['Settings', 'Array<Settings>']);
    expect(history(typeDefinition('Settings').properties.Target)).toEqual(['OldTarget', 'NewTarget']);
    expect(l1Changes()).toEqual([]);
    expect(settled(result)).toEqual(['rename OldTarget -> NewTarget at property Settings.Target']);
  });

  test('a struct renamed below a container change to one that shares no field has no pair', () => {
    importRegistry(released, {
      properties: { Settings: ref('Settings') },
      definitions: { Settings: object({ Target: ref('OldTarget') }), OldTarget: arn() },
    });
    importRegistry(db, {
      properties: { Settings: { type: 'array', items: ref('Settings') } },
      definitions: {
        Settings: object({ Target: ref('NewTarget') }),
        NewTarget: object({ Url: str() }),
      },
    });

    const result = run();

    expect(cases(result)).toEqual(['no-pair OldTarget at property Settings.Target']);
    expect(history(typeDefinition('Settings').properties.Target)[0]).toEqual('OldTarget');
  });

  test('a struct below a position whose CloudFormation type has another shape keeps its released history', () => {
    importRegistry(released, {
      properties: { Settings: ref('Settings') },
      definitions: { Settings: object({ Target: ref('OldTarget') }), OldTarget: arn() },
    });
    importRegistry(db, {
      properties: { Settings: { anyOf: [ref('Settings'), str()] } },
      definitions: { Settings: object({ Target: ref('NewTarget') }), NewTarget: arn() },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(history(typeDefinition('Settings').properties.Target)).toEqual(['OldTarget', 'NewTarget']);
    expect(l1Changes()).toEqual([]);
  });
});

describe('a released name that CloudFormation also uses elsewhere', () => {
  test('is compared at the positions where only the current sources use it', () => {
    // CloudFormation's Destination at Status has a field the released one lacks, so the split follows CloudFormation
    importRegistry(released, {
      properties: { Settings: ref('Destination') },
      definitions: { Destination: object({ Url: str(), Port: int() }) },
    });
    importRegistry(db, {
      properties: {
        Settings: ref('DestinationRequest'),
        Status: ref('Destination'),
      },
      definitions: {
        DestinationRequest: object({ Url: str(), Port: int() }),
        Destination: object({ State: str() }),
      },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(switched(result)).toEqual(['Destination -> DestinationRequest at property Settings']);
    expect(history(resource(db).properties.Settings)).toEqual(['DestinationRequest']);
    expect(history(resource(db).properties.Status)).toEqual(['Destination']);
    expect(fields('Destination')).toEqual({ State: 'string' });
  });

  test('is compared at the fields of a struct that follows CloudFormation by entry', () => {
    // With the entry, the L1 renders CloudFormation's Settings, Extra included, so Dest is rendered there
    importRegistry(released, {
      properties: { Settings: ref('Settings'), Backup: ref('Dest') },
      definitions: {
        Settings: object({ Url: str(), Port: int() }),
        Dest: object({ Url: str(), Port: int() }),
      },
    });
    importRegistry(db, {
      properties: { Settings: ref('Settings'), Backup: ref('DestRequest') },
      definitions: {
        Settings: object({ Url: str(), Extra: ref('Dest') }),
        DestRequest: object({ Url: str(), Port: int() }),
        Dest: object({ State: str() }),
      },
    });

    const result = run([
      mapping({ resource: RESOURCE, oldType: 'Settings', newTypes: [], kind: 'follow-cloudformation' }),
    ]);

    expect(fields('Settings')).toEqual({ Url: 'string', Extra: 'Dest' });
    expect(cases(result)).toEqual([]);
    expect(switched(result)).toEqual(['Dest -> DestRequest at property Backup']);
    expect(fields('Dest')).toEqual({ State: 'string' });
  });

  test.each([
    ['a property', false],
    ['a struct field', true],
  ])(
    'is compared below a union member that follows CloudFormation by entry at %s while another member stays',
    (_, nested) => {
      // With the entry, the L1 renders CloudFormation's union at Target, SqsTarget.Extra included
      const inOuter = (s: jsonschema.Schema): jsonschema.Schema => (nested ? ref('Outer') : s);
      const releasedTarget: jsonschema.Schema = {
        anyOf: [ref('Queue'), ref('Topic')],
      } as any;
      const currentTarget: jsonschema.Schema = {
        anyOf: [ref('SqsTarget'), ref('SnsTarget')],
      } as any;
      importRegistry(released, {
        properties: { Top: inOuter(releasedTarget), Backup: ref('Dest') },
        definitions: {
          ...(nested ? { Outer: object({ Target: releasedTarget }) } : {}),
          Queue: object({ Arn: str() }),
          Topic: object({ Url: str() }),
          Dest: object({ Url: str(), Port: int() }),
        },
      });
      importRegistry(db, {
        properties: { Top: inOuter(currentTarget), Backup: ref('DestRequest') },
        definitions: {
          ...(nested ? { Outer: object({ Target: currentTarget }) } : {}),
          SqsTarget: object({ Arn: str(), Extra: ref('Dest') }),
          SnsTarget: object({ Url: str() }),
          DestRequest: object({ Url: str(), Port: int() }),
          Dest: object({ State: str() }),
        },
      });

      const result = run([
        mapping({ resource: RESOURCE, oldType: 'Queue', newTypes: [], kind: 'follow-cloudformation' }),
      ]);

      const target = nested ? typeDefinition('Outer').properties.Target : resource(db).properties.Top;
      expect(history(target)).toEqual(['SqsTarget | SnsTarget']);
      // Dest is rendered at SqsTarget.Extra with CloudFormation's State, so the split follows CloudFormation
      expect(cases(result)).toEqual([]);
      expect(switched(result)).toEqual(['Dest -> DestRequest at property Backup']);
      expect(fields('Dest')).toEqual({ State: 'string' });
    },
  );

  test('stays settled where the other use has the same fields', () => {
    importRegistry(released, {
      properties: { Settings: ref('Destination') },
      definitions: { Destination: object({ Url: str() }) },
    });
    importRegistry(db, {
      properties: { Settings: ref('Destination'), Backup: ref('Destination') },
      definitions: { Destination: object({ Url: str() }) },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(fields('Destination')).toEqual({ Url: 'string' });
  });

  test('takes the field types of its own positions where CloudFormation gives its name to another renamed struct', () => {
    // At First the L1 renders A, so CloudFormation's B there types none of the kept B's fields
    importRegistry(released, {
      properties: { First: ref('A'), Second: ref('B') },
      definitions: { A: object({ X: str() }), B: object({ Y: str() }) },
    });
    importRegistry(db, {
      properties: { First: ref('B'), Second: ref('C') },
      definitions: {
        B: object({ X: str(), M: str() }),
        C: object({ Y: str(), M: int() }),
      },
    });

    const result = run();

    expect(fields('B')).toEqual({ Y: 'string', M: 'integer' });
    expect(fields('A')).toEqual({ X: 'string', M: 'string' });
    expect(cases(result)).toEqual([]);
    expect(settled(result)).toEqual(['rename A -> B at property First', 'rename B -> C at property Second']);
  });

  test('is compared at a field the L1 renders through a renamed struct that CloudFormation gives another kept name', () => {
    // At First the L1 renders A with CloudFormation's B's fields, N included, so it renders Dest at First.N, although
    // the kept B leaves N out
    importRegistry(released, {
      properties: {
        First: ref('A'),
        Second: ref('B'),
        Third: ref('Dest'),
      },
      definitions: {
        A: object({ X: str() }),
        B: object({ Y: str() }),
        Dest: object({ Url: str(), Port: int() }),
      },
    });
    importRegistry(db, {
      properties: {
        First: ref('B'),
        Second: ref('C'),
        Third: ref('DestRequest'),
      },
      definitions: {
        B: object({ X: str(), N: ref('Dest') }),
        C: object({ Y: str() }),
        DestRequest: object({ Url: str(), Port: int() }),
        Dest: object({ State: str() }),
      },
    });

    const result = run();

    expect(fields('A')).toEqual({ X: 'string', N: 'Dest' });
    expect(cases(result)).toEqual([]);
    expect(switched(result)).toEqual(['Dest -> DestRequest at property Third']);
    expect(fields('Dest')).toEqual({ State: 'string' });
  });

  test('is compared at the fields of a struct that only an attribute reaches', () => {
    importRegistry(released, {
      properties: { Settings: ref('Destination') },
      definitions: { Destination: object({ Url: str(), Port: int() }) },
    });
    importRegistry(db, {
      properties: {
        Settings: ref('DestinationRequest'),
        Status: ref('Status'),
      },
      readOnlyProperties: ['/properties/Status'],
      definitions: {
        DestinationRequest: object({ Url: str(), Port: int() }),
        Status: object({ Last: ref('Destination') }),
        Destination: object({ State: str() }),
      },
    });

    const result = run();

    expect(Object.keys(resource(db).attributes)).toContain('Status');
    expect(cases(result)).toEqual([]);
    expect(switched(result)).toEqual(['Destination -> DestinationRequest at property Settings']);
    expect(fields('Destination')).toEqual({ State: 'string' });
  });
});

describe('types rendered for backwards compatibility', () => {
  test('a released flagged type that no current source has keeps rendering', () => {
    importLegacySpec(released, {
      properties: { Name: { PrimitiveType: 'String', UpdateType: 'Mutable' } },
      types: { Unused: { Properties: { Url: { PrimitiveType: 'String', UpdateType: 'Mutable' } } } },
    });
    importRegistry(db, { properties: { Name: str() } });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(typeDefinition('Unused').mustRenderForBwCompat).toBe(true);
    expect(fields('Unused')).toEqual({ Url: 'string' });
    expect(l1Changes()).toEqual([]);
  });

  test('a released flagged type keeps its flag on the current type of its name', () => {
    importLegacySpec(released, {
      properties: { Name: { PrimitiveType: 'String', UpdateType: 'Mutable' } },
      types: { Unused: { Properties: { Url: { PrimitiveType: 'String', UpdateType: 'Mutable' } } } },
    });
    importRegistry(db, {
      properties: { Name: str(), Other: ref('Unused') },
      definitions: { Unused: object({ Url: str() }) },
    });

    run();

    expect(typeDefinition('Unused').mustRenderForBwCompat).toBe(true);
  });

  test('a released flagged type that the L1 also renders at a property keeps its flag', () => {
    // The released database flags the type and renders it at Other, the current sources only render it there
    importLegacySpec(released, {
      properties: { Name: { PrimitiveType: 'String', UpdateType: 'Mutable' } },
      types: { Unused: { Properties: { Url: { PrimitiveType: 'String', UpdateType: 'Mutable' } } } },
    });
    const registry: Partial<CloudFormationRegistryResource> = {
      properties: { Name: str(), Other: ref('Unused') },
      definitions: { Unused: object({ Url: str() }) },
    };
    importRegistry(released, registry);
    importRegistry(db, registry);
    expect(resourceTypeDefinition(released, 'Unused').mustRenderForBwCompat).toBe(true);
    expect(typeDefinition('Unused').mustRenderForBwCompat).toBeUndefined();

    run();

    expect(typeDefinition('Unused').mustRenderForBwCompat).toBe(true);
  });
});

describe('released structs below a kept field that no position reaches', () => {
  // The kept Settings keeps its released field Target, and CloudFormation gives the name OldTarget to another struct
  const releasedSettings: Partial<CloudFormationRegistryResource> = {
    properties: { Settings: ref('Settings') },
    definitions: { Settings: object({ Target: ref('OldTarget') }), OldTarget: arn() },
  };
  const otherOldTarget = {
    Other: ref('OldTarget'),
  };
  const otherOldTargetDefinition = { OldTarget: object({ State: str() }) };

  test('are compared with the current struct of their name where CloudFormation gives the position another shape', () => {
    // CloudFormation's Settings is now any JSON
    const setup = () => {
      importRegistry(released, releasedSettings);
      importRegistry(db, {
        properties: { Settings: {}, ...otherOldTarget },
        definitions: otherOldTargetDefinition,
      });
    };

    const first = runFresh(setup);
    expect(cases(first)).toEqual(['diverging OldTarget at property Other, property Settings.Target']);
    expect(first.undecided[0].positions.map((p) => `${p.position}: ${p.fields.join(', ')}`)).toEqual([
      'property Other: State',
      'property Settings.Target: Arn',
    ]);
    // Until a person decides, the kept struct loses no released field
    expect(fields('OldTarget')).toEqual({ Arn: 'string', State: 'string' });

    const second = runFresh(setup, [chosen(first, 'keep-old')]);
    expect(cases(second)).toEqual([]);
    expect(history(typeDefinition('Settings').properties.Target)).toEqual(['OldTarget']);
    expect(fields('OldTarget')).toEqual({ Arn: 'string', State: 'string' });

    // Following CloudFormation, the kept field renders CloudFormation's struct of that name
    const third = runFresh(setup, [chosen(first, 'follow-cloudformation')]);
    expect(cases(third)).toEqual([]);
    expect(history(typeDefinition('Settings').properties.Target)).toEqual(['OldTarget']);
    expect(fields('OldTarget')).toEqual({ State: 'string' });
  });

  test('are compared where CloudFormation makes the position a union', () => {
    importRegistry(released, releasedSettings);
    importRegistry(db, {
      properties: { Settings: { anyOf: [ref('Settings'), str()] }, ...otherOldTarget },
      definitions: {
        Settings: object({ Target: ref('NewTarget') }),
        NewTarget: arn(),
        ...otherOldTargetDefinition,
      },
    });

    const result = run();

    expect(cases(result)).toEqual(['diverging OldTarget at property Other, property Settings.Target']);
    expect(history(typeDefinition('Settings').properties.Target)[0]).toEqual('OldTarget');
  });

  test('are compared where a keep-old entry decides a released struct without a pair', () => {
    importRegistry(released, releasedSettings);
    importRegistry(db, {
      properties: { Settings: ref('Options'), ...otherOldTarget },
      definitions: { Options: object({ Name: str() }), ...otherOldTargetDefinition },
    });

    const result = run([mapping({ resource: RESOURCE, oldType: 'Settings', newTypes: ['Options'], kind: 'keep-old' })]);

    expect(cases(result)).toEqual(['diverging OldTarget at property Other, property Settings.Target']);
    expect(fields('Settings')).toEqual({ Target: 'OldTarget', Name: 'string' });
  });

  test('keep their released fields where no current struct has their name', () => {
    importRegistry(released, releasedSettings);
    importRegistry(db, { properties: { Settings: {} } });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(fields('OldTarget')).toEqual({ Arn: 'string' });
    expect(l1Changes()).toEqual([]);
  });

  test('pass the gate with each printed entry where CloudFormation renamed them elsewhere', () => {
    // Settings becomes any JSON; OldTarget is also rendered at Backup, which CloudFormation renamed to NewTarget
    const setup = () => {
      importRegistry(released, {
        properties: { Settings: ref('Settings'), Backup: ref('OldTarget') },
        definitions: { Settings: object({ Target: ref('OldTarget') }), OldTarget: arn() },
      });
      importRegistry(db, {
        properties: { Settings: {}, Backup: ref('NewTarget') },
        definitions: { NewTarget: object({ Arn: str(), Region: str() }) },
      });
    };

    const first = runFresh(setup);
    // One CloudFormation type among its positions, so neither a merge nor a split
    expect(cases(first)).toEqual(['diverging OldTarget at property Backup, property Settings.Target']);
    expect(kinds(first.undecided[0])).toEqual(['split', 'keep-old', 'follow-cloudformation']);

    for (const kind of kinds(first.undecided[0])) {
      expect(cases(runFresh(setup, [chosen(first, kind)]))).toEqual([]);
    }

    // Following CloudFormation, which has no struct of that name, the kept field leaves the L1
    runFresh(setup, [chosen(first, 'follow-cloudformation')]);
    expect(Object.keys(typeDefinition('Settings').properties)).toEqual([]);
    expect(compareL1(released, db).removed.map((c) => c.element)).toContain('field Settings.Target');
  });

  test('keep their released requiredness', () => {
    importRegistry(released, {
      properties: { Settings: ref('Settings') },
      definitions: {
        Settings: object({ Target: ref('OldTarget') }),
        OldTarget: object({ Arn: str() }, ['Arn']),
      },
    });
    importRegistry(db, { properties: { Settings: {} } });

    run();

    expect(fields('OldTarget')).toEqual({ Arn: 'string (required)' });
    expect(l1Changes()).toEqual([]);
  });

  test('keep their released types where the current struct of their name is only below a field the L1 does not render', () => {
    // CloudFormation's Settings is any JSON, and its Inner struct is only below Hidden.Extra, which the L1 does not
    // render, so nothing CloudFormation has at the L1's positions changes Inner.Value
    importRegistry(released, {
      properties: { Settings: ref('Settings'), Hidden: ref('Hidden') },
      definitions: {
        Settings: object({ Inner: ref('Inner') }),
        Inner: object({ Value: {} }),
        Hidden: object({ Url: str() }),
      },
    });
    importRegistry(db, {
      properties: { Settings: {}, Hidden: { anyOf: [ref('Hidden'), str()] } },
      definitions: {
        Hidden: object({ Url: str(), Extra: ref('Inner') }),
        Inner: object({ Value: str() }),
      },
    });

    const result = run();

    expect(history(typeDefinition('Inner').properties.Value)).toEqual(['json']);
    expect(cases(result)).toEqual([]);
    expect(l1Changes()).toEqual([]);
  });
});

describe('a modern tag property renders the newest type of its history, so its type follows CloudFormation', () => {
  /** `Tags` as a list of the named struct, whose fields are required strings */
  const tagList = (struct: string, names = ['Key', 'Value']): Partial<CloudFormationRegistryResource> => ({
    properties: { Tags: { type: 'array', items: ref(struct) } as jsonschema.Schema },
    definitions: { [struct]: object(strings(names), names) },
  });
  const mixinStructs = () => [...new L1View(db, resource(db), 'cfn-property-mixins').structs.keys()].sort();

  test('a struct that CloudFormation renamed there is a type break, not a kept name, and the mixins keep it', () => {
    importRegistry(released, tagList('PolicyTag'));
    importRegistry(db, tagList('PolicyTagV2'));

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(settled(result)).toEqual([]);
    expect(tagBreaks(result)).toEqual(['property Tags: Array<PolicyTag> -> Array<PolicyTagV2>']);
    expect(gateFails(result)).toBe(false);
    expect(gate(result).report).toContain(
      [
        "Tag properties that follow CloudFormation's type (type breaks):",
        `  ${RESOURCE}: property Tags: Array<PolicyTag> -> Array<PolicyTagV2>`,
      ].join('\n'),
    );
    expect(gate(result).report).not.toContain('Settled');
    expect(l1Renames()).toEqual(['PolicyTag -> PolicyTagV2 at property Tags']);
    // The released history stays first, so the mixins still render the released struct, with its released fields
    expect(history(resource(db).properties.Tags)).toEqual(['Array<PolicyTag>', 'Array<PolicyTagV2>']);
    expect(l1Structs()).toEqual(['PolicyTagV2']);
    expect(mixinStructs()).toEqual(['PolicyTag', 'PolicyTagV2']);
    expect(Object.keys(fields('PolicyTag'))).toEqual(['Key', 'Value']);
  });

  test('the type breaks of several resources are listed by resource name, not in the order they were imported', () => {
    // DMS is imported first, and DevOps sorts first alphabetically
    for (const typeName of ['AWS::DMS::R', 'AWS::DevOps::R']) {
      importRegistry(released, tagList('PolicyTag'), typeName);
      importRegistry(db, tagList('PolicyTagV2'), typeName);
    }

    const result = run();

    expect(result.tagBreaks.map((b) => `${b.resource} ${b.position}`)).toEqual([
      'AWS::DevOps::R property Tags',
      'AWS::DMS::R property Tags',
    ]);
  });

  test('a struct only the mixins render keeps its released fields where CloudFormation changed the tag type', () => {
    // The released L1 renders the newest type, CloudFormation's tags; the mixins also render TagEntry
    importRegistry(released, tagList('TagEntry'));
    importRegistry(released, tagList('Tag'));
    importRegistry(db, tagList('TagEntryV2', ['Key', 'Value', 'Owner']));

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(settled(result)).toEqual([]);
    expect(tagBreaks(result)).toEqual(['property Tags: Array<tag> -> Array<TagEntryV2>']);
    expect(gateFails(result)).toBe(false);
    expect(history(resource(db).properties.Tags)).toEqual(['Array<TagEntry>', 'Array<tag>', 'Array<TagEntryV2>']);
    expect(mixinStructs()).toEqual(['TagEntry', 'TagEntryV2']);
    expect(Object.keys(fields('TagEntry'))).toEqual(['Key', 'Value']);
  });

  test('a struct only the mixins render stays as released where the tag type is unchanged', () => {
    importRegistry(released, tagList('TagEntry'));
    importRegistry(released, tagList('Tag'));
    importRegistry(db, tagList('Tag'));

    const result = run();

    expect([...cases(result), ...settled(result), ...switched(result), ...tagBreaks(result)]).toEqual([]);
    expect(history(resource(db).properties.Tags)).toEqual(['Array<TagEntry>', 'Array<tag>']);
    expect(l1Structs()).toEqual([]);
    expect(mixinStructs()).toEqual(['TagEntry']);
    expect(Object.keys(fields('TagEntry'))).toEqual(['Key', 'Value']);
    expect(l1Changes()).toEqual([]);
  });

  test('a struct only the mixins render keeps the released fields that a current type of its name lacks', () => {
    importRegistry(released, tagList('TagEntry'));
    importRegistry(released, tagList('Tag'));
    importRegistry(db, tagList('TagEntry', ['Key']));
    importRegistry(db, tagList('Tag'));

    const result = run();

    expect([...cases(result), ...settled(result), ...switched(result), ...tagBreaks(result)]).toEqual([]);
    expect(mixinStructs()).toEqual(['TagEntry']);
    expect(Object.keys(fields('TagEntry'))).toEqual(['Key', 'Value']);
    expect(l1Changes()).toEqual([]);
  });

  describe('a struct only the mixins render at the tag property takes the fields its other positions need', () => {
    const MIXINS_TAGS = 'property Tags in @aws-cdk/cfn-property-mixins only';

    test('where CloudFormation renamed it at both properties', () => {
      importRegistry(released, {
        properties: { Tags: { type: 'array', items: ref('PolicyTag') }, Other: ref('PolicyTag') },
        definitions: { PolicyTag: object(strings(['Key', 'Value']), ['Key', 'Value']) },
      });
      importRegistry(db, {
        properties: { Tags: { type: 'array', items: ref('PolicyTagV2') }, Other: ref('PolicyTagV2') },
        definitions: { PolicyTagV2: object(strings(['Key', 'Value', 'Owner']), ['Key', 'Value']) },
      });

      const result = run();

      expect(cases(result)).toEqual([]);
      expect(gateFails(result)).toBe(false);
      expect(settled(result)).toEqual(['rename PolicyTag -> PolicyTagV2 at property Other']);
      expect(tagBreaks(result)).toEqual(['property Tags: Array<PolicyTag> -> Array<PolicyTagV2>']);
      expect(fields('PolicyTag')).toEqual({ Key: 'string (required)', Value: 'string (required)', Owner: 'string' });
      expect(history(resource(db).properties.Other)).toEqual(['PolicyTag', 'PolicyTagV2']);
      expect(history(resource(db).properties.Tags)).toEqual(['Array<PolicyTag>', 'Array<PolicyTagV2>']);
      expect(mixinStructs()).toEqual(['PolicyTag', 'PolicyTagV2']);
    });

    test('where CloudFormation renamed it at the tag property only, with requiredness from the other property', () => {
      importRegistry(released, {
        properties: { Tags: { type: 'array', items: ref('PolicyTag') }, Other: ref('PolicyTag') },
        definitions: { PolicyTag: object(strings(['Key', 'Value']), ['Key', 'Value']) },
      });
      importRegistry(db, {
        properties: { Tags: { type: 'array', items: ref('PolicyTagV2') }, Other: ref('PolicyTag') },
        definitions: {
          PolicyTagV2: object(strings(['Key', 'Value']), ['Key', 'Value']),
          PolicyTag: object(strings(['Key', 'Value', 'Owner']), ['Key', 'Value', 'Owner']),
        },
      });

      const result = run();

      expect(cases(result)).toEqual([]);
      expect(gateFails(result)).toBe(false);
      expect(settled(result)).toEqual([]);
      expect(tagBreaks(result)).toEqual(['property Tags: Array<PolicyTag> -> Array<PolicyTagV2>']);
      // aws-cdk-lib renders PolicyTag at Other, where CloudFormation requires Owner
      expect(fields('PolicyTag')).toEqual({
        Key: 'string (required)',
        Value: 'string (required)',
        Owner: 'string (required)',
      });
      expect(mixinStructs()).toEqual(['PolicyTag', 'PolicyTagV2']);
    });

    test('where a struct below it is renamed at another property', () => {
      importRegistry(released, {
        properties: { Tags: { type: 'array', items: ref('PolicyTag') }, Other: ref('Inner') },
        definitions: {
          PolicyTag: object({ Key: str(), Value: str(), Meta: ref('Inner') }, ['Key', 'Value']),
          Inner: object(strings(['A', 'B'])),
        },
      });
      importRegistry(db, {
        properties: { Tags: { type: 'array', items: ref('PolicyTagV2') }, Other: ref('InnerV2') },
        definitions: {
          PolicyTagV2: object({ Key: str(), Value: str(), Meta: ref('InnerV2') }, ['Key', 'Value']),
          InnerV2: object(strings(['A', 'B', 'C'])),
        },
      });

      const result = run();

      expect(cases(result)).toEqual([]);
      expect(gateFails(result)).toBe(false);
      expect(settled(result)).toEqual(['rename Inner -> InnerV2 at property Other']);
      expect(tagBreaks(result)).toEqual(['property Tags: Array<PolicyTag> -> Array<PolicyTagV2>']);
      expect(Object.keys(fields('Inner'))).toEqual(['A', 'B', 'C']);
      expect(Object.keys(fields('PolicyTag'))).toEqual(['Key', 'Value', 'Meta']);
    });

    test('and diverges where the other position lacks its released fields, named as the mixins position', () => {
      // CloudFormation's TagEntry at Other has none of the fields the mixins render TagEntry with
      importRegistry(released, tagList('TagEntry'));
      importRegistry(released, tagList('Tag'));
      importRegistry(db, {
        properties: { Tags: { type: 'array', items: ref('TagEntryV2') }, Other: ref('TagEntry') },
        definitions: {
          TagEntryV2: object(strings(['Key', 'Value']), ['Key', 'Value']),
          TagEntry: object(strings(['Name'])),
        },
      });

      const result = run();

      expect(cases(result)).toEqual([`diverging TagEntry at property Other, ${MIXINS_TAGS}`]);
      expect(gateFails(result)).toBe(true);
      expect(gate(result).report).not.toMatch(/^ {2}property Tags:/m);
      expect(tagBreaks(result)).toEqual(['property Tags: Array<tag> -> Array<TagEntryV2>']);
    });

    test('and does not make a split of it at other properties follow CloudFormation', () => {
      // CloudFormation split Kv at A and B and removed Value at both, which keeps Kv in aws-cdk-lib without Value, but
      // the mixins render Kv with Value
      importRegistry(released, {
        properties: { Tags: { type: 'array', items: ref('Kv') }, A: ref('Kv'), B: ref('Kv') },
        definitions: { Kv: object(strings(['Key', 'Value']), ['Key']) },
      });
      importRegistry(db, {
        properties: { Tags: { type: 'array', items: ref('KvT') }, A: ref('KvA'), B: ref('KvB') },
        definitions: {
          KvT: object(strings(['Key', 'Value']), ['Key']),
          KvA: object(strings(['Key']), ['Key']),
          KvB: object(strings(['Key']), ['Key']),
        },
      });

      const result = run();

      expect(switched(result)).toEqual([]);
      expect(cases(result)).toEqual([`diverging Kv at property A, property B, ${MIXINS_TAGS}`]);
    });

    test('a keep-old entry for it names the tag property as the mixins position', () => {
      importRegistry(released, tagList('PolicyTag'));
      importRegistry(db, tagList('PolicyTagV2'));
      const entry = mapping({ resource: RESOURCE, oldType: 'PolicyTag', newTypes: ['PolicyTagV2'], kind: 'keep-old' });

      const result = run([entry]);

      expect(result.applied.map((a) => a.positions)).toEqual([[MIXINS_TAGS]]);
      expect(tagBreaks(result)).toEqual(['property Tags: Array<PolicyTag> -> Array<PolicyTagV2>']);
    });

    test('a rename entry for it applies nowhere, because only the mixins render it', () => {
      importRegistry(released, tagList('PolicyTag'));
      importRegistry(db, tagList('PolicyTagV2'));
      const entry = mapping({ resource: RESOURCE, oldType: 'PolicyTag', newTypes: ['PolicyTagV2'], kind: 'rename' });

      const result = run([entry]);

      expect(applied(result)).toEqual([]);
      expect(result.inactive.map((i) => i.reason)).toEqual([
        'only @aws-cdk/cfn-property-mixins renders PolicyTag, at property Tags, and no CloudFormation type there is paired with it',
      ]);
      expect(tagBreaks(result)).toEqual(['property Tags: Array<PolicyTag> -> Array<PolicyTagV2>']);
    });
  });
});

function arn() {
  return object({ Arn: str() });
}

function labels() {
  return object({ Labels: map() });
}

function map(): jsonschema.Schema {
  return { type: 'object', patternProperties: { '.*': str() } } as any;
}

function run(mappings: TypeMapping[] = []): TypeHistoryResult {
  return importTypeHistory(db, released, mappings);
}

function runFresh(setup: () => void, mappings: TypeMapping[] = []): TypeHistoryResult {
  released = emptyDatabase();
  db = emptyDatabase();
  setup();
  return run(mappings);
}

function cases(result: TypeHistoryResult) {
  return result.undecided.map((c) => `${c.kind} ${c.releasedType} at ${c.positions.map((p) => p.position).join(', ')}`);
}

function kinds(undecided: UndecidedCase) {
  return undecided.entries.map((e) => e.kind);
}

function settled(result: TypeHistoryResult) {
  return result.settled.map(
    (s) => `${s.kind} ${s.releasedType} -> ${s.newTypes.join(', ')} at ${s.positions.join(', ')}`,
  );
}

function switched(result: TypeHistoryResult) {
  return result.switched.map((s) => `${s.releasedType} -> ${s.newType} at ${s.positions.join(', ')}`);
}

function tagBreaks(result: TypeHistoryResult) {
  return result.tagBreaks.map((b) => `${b.position}: ${b.releasedType} -> ${b.newType}`);
}

/**
 * The struct renames of the L1 change report from the released database, one line per new struct
 */
function l1Renames() {
  const renames = compareL1(released, db).renames;
  return [...new Set(renames.map((r) => r.to))].map((to) => {
    const merged = renames.filter((r) => r.to === to);
    return `${merged.map((r) => r.from).join(', ')} -> ${to} at ${merged.flatMap((r) => r.positions).join(', ')}`;
  });
}

function l1Structs() {
  return [...new L1View(db, resource(db)).structs.keys()].sort();
}

function chosen(result: TypeHistoryResult, kind: TypeMappingKind): TypeMapping {
  const entry = result.undecided[0].entries.find((e) => e.kind === kind);
  if (!entry) {
    throw new Error(`No ${kind} entry printed`);
  }
  return fill(entry);
}

function fill(entry: TypeMapping): TypeMapping {
  return { ...entry, reason: 'Chosen in a test', pr: 'https://github.com/cdklabs/awscdk-service-spec/pull/1' };
}

function mapping(entry: Pick<TypeMapping, 'resource' | 'oldType' | 'newTypes' | 'kind'>): TypeMapping {
  return fill({ ...entry, reason: '', pr: '' });
}

function gate(result: TypeHistoryResult) {
  return typeGate(result, { mappingFile: MAPPING_FILE, baselineVersion: '1.2.3' });
}

function gateFails(result: TypeHistoryResult) {
  return gate(result).failed;
}

function applied(result: TypeHistoryResult) {
  return result.applied.map((a) => `${a.entry.kind} ${a.entry.oldType}`);
}

function l1Changes() {
  const changes = compareL1(released, db);
  return [...changes.renames, ...changes.removed, ...changes.requiredness, ...changes.other];
}

function resource(target: SpecDatabase, typeName = RESOURCE) {
  return target.lookup('resource', 'cloudFormationType', 'equals', typeName).only();
}

function typeDefinition(name: string) {
  return resourceTypeDefinition(db, name);
}

function history(prop: Pick<Property, 'type' | 'previousTypes'>) {
  return new RichProperty(prop as Property).types().map((t) => new RichPropertyType(t).stringify(db, false));
}

function fields(typeName: string) {
  return Object.fromEntries(
    Object.entries(typeDefinition(typeName).properties).map(([name, prop]) => [
      name,
      `${history(prop)[0]}${prop.required ? ' (required)' : ''}`,
    ]),
  );
}

type Order = 'given' | 'reversed';
const ORDERS: Order[] = ['given', 'reversed'];

/** The schema as given, or with the order of its properties, definitions and their fields reversed */
function inOrder(
  order: Order,
  schema: Partial<CloudFormationRegistryResource>,
): Partial<CloudFormationRegistryResource> {
  if (order === 'given') {
    return schema;
  }
  const reversed = <A>(record: Record<string, A>) => Object.fromEntries(Object.entries(record).reverse());
  return {
    ...schema,
    properties: reversed(schema.properties ?? {}),
    definitions: reversed(
      Object.fromEntries(
        Object.entries(schema.definitions ?? {}).map(([name, def]) => [
          name,
          (def as any).properties ? { ...(def as any), properties: reversed((def as any).properties) } : def,
        ]),
      ),
    ),
  };
}

function permutations<A>(xs: A[]): A[][] {
  return xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations(xs.filter((_, j) => j !== i)).map((p) => [x, ...p]));
}

function inKeyOrder<A>(record: Record<string, A>, keys: string[]): Record<string, A> {
  return Object.fromEntries(keys.map((key) => [key, record[key]]));
}

/** The gate text, the rendered L1 and the L1 change report of a run */
function runOutput(result: TypeHistoryResult) {
  return { gate: gate(result).report, l1: canonicalL1(), changes: formatL1Changes(compareL1(released, db)) };
}

/** Each rendered property and struct field with its whole type history, sorted */
function canonicalL1(pkg: GeneratedPackage = 'aws-cdk-lib') {
  const view = new L1View(db, resource(db), pkg);
  const line = (name: string, field: Property, required: boolean) =>
    `${name}: ${history(field).join(' <- ')}${required ? ' (required)' : ''}`;
  const properties = Object.keys(view.properties)
    .sort()
    .map((name) => `property ${line(name, resource(db).properties[name], view.properties[name].required)}`);
  const structs = [...view.structs.keys()].sort().map((name) => {
    const struct = view.structs.get(name)!;
    const rendered = view.fields(struct);
    const fieldLines = Object.keys(rendered)
      .sort()
      .map((f) => line(f, struct.properties[f], rendered[f].required));
    return `${name} { ${fieldLines.join('; ')} }`;
  });
  return [...properties, ...structs];
}
