import { emptyDatabase, Property, RichProperty, RichPropertyType, SpecDatabase } from '@aws-cdk/service-spec-types';
import { importCloudFormationRegistryResource } from '../src/importers/import-cloudformation-registry';
import { ResourceSpecImporter } from '../src/importers/import-resource-spec';
import { importTypeHistory, TypeHistoryResult, UndecidedCase } from '../src/importers/import-type-history';
import { compareL1 } from '../src/l1-changes';
import { L1View } from '../src/l1-view';
import { ProblemReport } from '../src/report';
import { typeGate } from '../src/type-gate';
import { TypeMapping, TypeMappingKind } from '../src/type-mappings';
import { CloudFormationRegistryResource, jsonschema, resourcespec } from '../src/types';

const RESOURCE = 'AWS::Some::Type';
const MAPPING_FILE = 'build/type-mappings.json';

let released: SpecDatabase;
let db: SpecDatabase;
beforeEach(() => {
  released = emptyDatabase();
  db = emptyDatabase();
});

describe('cases the matcher cannot decide fail the gate, and pass with the printed entry', () => {
  test('a struct replaced by one that shares no field has no pair', () => {
    const setup = () => {
      importRegistry(released, {
        properties: { Settings: { $ref: '#/definitions/Settings' } },
        definitions: { Settings: object({ Url: { type: 'string' }, Port: { type: 'integer' } }) },
      });
      importRegistry(db, {
        properties: { Settings: { $ref: '#/definitions/Options' } },
        definitions: { Options: object({ Name: { type: 'string' }, Mode: { type: 'string' } }) },
      });
    };

    const first = runFresh(setup);
    expect(cases(first)).toEqual(['no-pair Settings at property Settings']);
    expect(kinds(first.undecided[0])).toEqual(['rename', 'replace', 'keep-old', 'follow-cloudformation']);
    expect(gateFails(first)).toBe(true);

    const second = runFresh(setup, [chosen(first, 'replace')]);
    expect(cases(second)).toEqual([]);
    expect(gateFails(second)).toBe(false);
    expect(history(resource(db).properties.Settings)).toEqual(['Options']);
    expect(rendersType('Settings')).toBe(false);
  });

  test('two current types at one position that both pair are ambiguous candidates', () => {
    const setup = () => {
      importRegistry(released, {
        properties: { Target: { anyOf: [{ $ref: '#/definitions/Queue' }, { $ref: '#/definitions/Topic' }] } },
        definitions: {
          Queue: object({ Arn: { type: 'string' } }),
          Topic: object({ Url: { type: 'string' } }),
        },
      });
      importRegistry(db, {
        properties: {
          Target: { anyOf: [{ $ref: '#/definitions/SqsTarget' }, { $ref: '#/definitions/SnsTarget' }] },
        },
        definitions: {
          SqsTarget: object({ Arn: { type: 'string' }, Region: { type: 'string' } }),
          SnsTarget: object({ Arn: { type: 'string' }, Url: { type: 'string' } }),
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
        properties: { Settings: { $ref: '#/definitions/Settings' }, Other: { $ref: '#/definitions/OldTarget' } },
        definitions: { Settings: object({ Target: { $ref: '#/definitions/OldTarget' } }), OldTarget: arn() },
      });
      importRegistry(db, {
        properties: { Settings: {}, Other: { $ref: '#/definitions/OldTarget' } },
        definitions: { OldTarget: object({ Arn: { type: 'string' }, State: { type: 'string' } }) },
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
        First: { $ref: '#/definitions/Shared' },
        Second: { $ref: '#/definitions/Shared' },
        Third: { $ref: '#/definitions/Shared' },
      },
      definitions: { Shared: object({ Url: { type: 'string' } }) },
    });
    importRegistry(db, {
      properties: { First: { $ref: '#/definitions/Shared' }, Second: {}, Third: { $ref: '#/definitions/Other' } },
      definitions: {
        Shared: object({ Url: { type: 'string' }, Mode: { type: 'string' } }),
        Other: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
      },
    });

    const result = run();

    expect(cases(result)).toEqual(['diverging Shared at property First, property Second, property Third']);
    expect(gateFails(result)).toBe(true);
    expect(switched(result)).toEqual([]);
    expect(history(resource(db).properties.Third)[0]).toEqual('Shared');
  });

  test('the printed entries are complete and the gate writes them', () => {
    const setup = () => {
      importRegistry(released, {
        properties: { Settings: { $ref: '#/definitions/Settings' } },
        definitions: { Settings: object({ Url: { type: 'string' }, Port: { type: 'integer' } }) },
      });
      importRegistry(db, {
        properties: { Settings: { $ref: '#/definitions/Options' } },
        definitions: { Options: object({ Name: { type: 'string' }, Mode: { type: 'string' } }) },
      });
    };
    const result = runFresh(setup);
    const gate = typeGate(result, { mappingFile: MAPPING_FILE, baselineVersion: '1.2.3' });

    expect(gate.failed).toBe(true);
    expect(gate.entries).toContain(`${RESOURCE}: Settings has no pair`);
    expect(gate.entries).toContain(`Add one of these entries to ${MAPPING_FILE}:`);
    for (const entry of result.undecided[0].entries) {
      expect(gate.entries).toContain(JSON.stringify(entry));
      expect(Object.keys(entry)).toEqual(['resource', 'oldType', 'newTypes', 'kind', 'reason', 'pr']);
    }
    expect(gate.report).toContain('Type history gate against the released database 1.2.3: FAIL (1 undecided)');
    expect(gate.report).toContain(gate.entries);
  });
});

describe('settled changes pass the gate', () => {
  test('a rename that adds an optional field keeps the released name with the new field', () => {
    importRegistry(released, {
      properties: { Settings: { $ref: '#/definitions/SettingsRequest' } },
      definitions: { SettingsRequest: object({ Url: { type: 'string' } }) },
    });
    importRegistry(db, {
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: object({ Url: { type: 'string' }, Port: { type: 'integer' } }) },
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
      properties: { Pod: { $ref: '#/definitions/Pod' } },
      definitions: { Pod: object({ Metadata: { $ref: '#/definitions/Metadata' } }), Metadata: labels() },
    });
    importRegistry(released, {
      properties: { Pod: { $ref: '#/definitions/Pod' } },
      definitions: { Pod: object({ Metadata: { $ref: '#/definitions/EksMetadata' } }), EksMetadata: labels() },
    });
    importRegistry(db, {
      properties: { Pod: { $ref: '#/definitions/Pod' } },
      definitions: {
        Pod: object({ Metadata: { $ref: '#/definitions/EksMetadata' } }),
        EksMetadata: object({ Labels: map(), Namespace: { type: 'string' }, Annotations: map() }),
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
      properties: { Burn: { $ref: '#/definitions/BurnSettings' }, Dvb: { $ref: '#/definitions/DvbSettings' } },
      definitions: {
        BurnSettings: object({ Font: { type: 'string' } }),
        DvbSettings: object({ Font: { type: 'string' } }),
      },
    });
    importRegistry(db, {
      properties: { Burn: { $ref: '#/definitions/BurnDvbSettings' }, Dvb: { $ref: '#/definitions/BurnDvbSettings' } },
      definitions: { BurnDvbSettings: object({ Font: { type: 'string' } }) },
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
      properties: { First: { $ref: '#/definitions/A' }, Second: { $ref: '#/definitions/B' } },
      definitions: {
        A: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
        B: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
      },
    });
    importRegistry(db, {
      properties: { First: { $ref: '#/definitions/C' }, Second: { $ref: '#/definitions/C' } },
      definitions: { C: object({ Url: { type: 'string' } }) },
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
      properties: { First: { $ref: '#/definitions/Shared' }, Second: { $ref: '#/definitions/Shared' } },
      definitions: { Shared: object({ Url: { type: 'string' }, Port: { type: 'integer' } }) },
    });
    importRegistry(db, {
      properties: { First: { $ref: '#/definitions/FirstSettings' }, Second: { $ref: '#/definitions/SecondSettings' } },
      definitions: {
        FirstSettings: object({ Url: { type: 'string' } }),
        SecondSettings: object({ Url: { type: 'string' } }),
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
      properties: { First: { $ref: '#/definitions/Shared' }, Second: { $ref: '#/definitions/Shared' } },
      definitions: { Shared: object({ Url: { type: 'string' } }) },
    });
    importRegistry(db, {
      properties: { First: { $ref: '#/definitions/FirstSettings' }, Second: { $ref: '#/definitions/SecondSettings' } },
      definitions: {
        FirstSettings: object({ Url: { type: 'string' } }),
        SecondSettings: object({ Url: { type: 'string' } }),
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
      properties: { Settings: { $ref: '#/definitions/Old' } },
      definitions: {
        Old: object({
          A: { type: 'string' },
          B: { type: 'string' },
          C: { type: 'string' },
          D: { type: 'string' },
          E: { type: 'string' },
        }),
      },
    });
    importRegistry(db, {
      properties: { Settings: { $ref: '#/definitions/New' } },
      definitions: { New: object({ A: { type: 'string' }, X: { type: 'string' } }) },
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
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: object({ Url: { type: 'string' } }) },
    });
    importRegistry(released, {
      properties: { Settings: { $ref: '#/definitions/SettingsV2' } },
      definitions: { SettingsV2: object({ Url: { type: 'string' } }) },
    });
    importRegistry(db, {
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: object({ Url: { type: 'string' } }) },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(history(resource(db).properties.Settings)).toEqual(['Settings', 'SettingsV2']);
    expect(l1Changes()).toEqual([]);
  });

  test('a container or primitive change at a kept position keeps the released type rendered', () => {
    importRegistry(released, {
      properties: { Settings: { $ref: '#/definitions/Settings' }, Count: { type: 'string' } },
      definitions: { Settings: object({ Url: { type: 'string' } }) },
    });
    importRegistry(db, {
      properties: {
        Settings: { type: 'array', items: { $ref: '#/definitions/Settings' } },
        Count: { type: 'integer' },
      },
      definitions: { Settings: object({ Url: { type: 'string' } }) },
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
        Kept: { type: 'string' },
        Removed: { type: 'string' },
        Settings: { $ref: '#/definitions/Settings' },
        Arn: { type: 'string' },
      },
      definitions: { Settings: object({ Url: { type: 'string' }, Gone: { type: 'string' } }) },
      readOnlyProperties: ['/properties/Arn'],
    });
    importRegistry(released, { properties: { Name: { type: 'string' } } }, 'AWS::Some::Removed');
    importRegistry(db, {
      properties: { Kept: { type: 'string' }, Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: object({ Url: { type: 'string' } }) },
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
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: object({ Url: { type: 'string' } }) },
    });
    importRegistry(db, {
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: object({ Url: { type: 'string' } }) },
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
    expect(typeGate(result, { mappingFile: MAPPING_FILE, baselineVersion: '1.2.3' }).failed).toBe(false);
  });

  test('a json property that CloudFormation now types as a string follows the json-to-string rule', () => {
    importRegistry(released, { properties: { Policy: {} } });
    importRegistry(db, { properties: { Policy: { type: 'string' } } });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(history(resource(db).properties.Policy)).toEqual(['string']);
  });

  test('a released type that only the released database still describes is kept', () => {
    importRegistry(released, {
      properties: { Settings: { $ref: '#/definitions/SettingsRequest' } },
      definitions: { SettingsRequest: object({ Url: { type: 'string' } }) },
    });
    importRegistry(released, {
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: object({ Url: { type: 'string' } }) },
    });
    importRegistry(db, {
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: object({ Url: { type: 'string' } }) },
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
      properties: { First: { $ref: '#/definitions/A' }, Second: { $ref: '#/definitions/B' } },
      definitions: { A: object({ Url: { type: 'string' } }), B: object({ Url: { type: 'string' } }) },
    };
    const merged = (fieldsOfC: jsonschema.ObjectProperties, required?: string[]) => ({
      properties: { First: { $ref: '#/definitions/C' }, Second: { $ref: '#/definitions/C' } },
      definitions: { C: object(fieldsOfC, required) },
    });

    test('in the build that merges them', () => {
      importRegistry(released, before);
      importRegistry(db, merged({ Url: { type: 'string' }, X: { type: 'string' } }, ['X']));

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
      importRegistry(db, merged({ Url: { type: 'string' } }));
      run();
      const baseline = emptyDatabase();
      baseline.load(JSON.parse(JSON.stringify(db.save())));

      released = baseline;
      db = emptyDatabase();
      importRegistry(db, merged({ Url: { type: 'string' }, X: { type: 'string' } }, ['X']));
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
      importRegistry(db, merged({ Url: { type: 'string' }, X: { type: 'string' } }, ['X']));

      const result = run([
        mapping({ resource: RESOURCE, oldType: 'A', newTypes: ['C'], kind: 'merge' }),
        mapping({ resource: RESOURCE, oldType: 'B', newTypes: ['C'], kind: 'merge' }),
      ]);

      expect(cases(result)).toEqual([]);
      expect(switched(result)).toEqual([]);
      expect(result.applied.map((a) => `${a.entry.kind} ${a.entry.oldType}`)).toEqual(['merge A', 'merge B']);
      expect(history(resource(db).properties.First)).toEqual(['A', 'C']);
      expect(history(resource(db).properties.Second)).toEqual(['B', 'C']);
      expect(fields('A')).toEqual({ Url: 'string', X: 'string (required)' });
      expect(fields('B')).toEqual({ Url: 'string', X: 'string (required)' });
      expect(l1Renames()).toEqual([]);
    });
  });

  test('a merge entry for the merged type that lacks the field keeps only that one, and the other switches', () => {
    importRegistry(released, {
      properties: { First: { $ref: '#/definitions/A' }, Second: { $ref: '#/definitions/B' } },
      definitions: {
        A: object({ Url: { type: 'string' } }),
        B: object({ Url: { type: 'string' }, Mode: { type: 'string' } }),
      },
    });
    importRegistry(db, {
      properties: { First: { $ref: '#/definitions/C' }, Second: { $ref: '#/definitions/C' } },
      definitions: { C: object({ Url: { type: 'string' }, Mode: { type: 'string' } }) },
    });

    const result = run([mapping({ resource: RESOURCE, oldType: 'A', newTypes: ['C'], kind: 'merge' })]);

    expect(cases(result)).toEqual([]);
    expect(result.applied.map((a) => `${a.entry.kind} ${a.entry.oldType}`)).toEqual(['merge A']);
    expect(switched(result)).toEqual(['B -> C at property Second']);
    expect(history(resource(db).properties.First)).toEqual(['A', 'C']);
    expect(history(resource(db).properties.Second)).toEqual(['C']);
    expect(fields('A')).toEqual({ Url: 'string', Mode: 'string' });
  });

  test('every split type that gains the same field switches at its own position', () => {
    importRegistry(released, {
      properties: { First: { $ref: '#/definitions/Shared' }, Second: { $ref: '#/definitions/Shared' } },
      definitions: { Shared: object({ Url: { type: 'string' } }) },
    });
    importRegistry(db, {
      properties: { First: { $ref: '#/definitions/FirstSettings' }, Second: { $ref: '#/definitions/SecondSettings' } },
      definitions: {
        FirstSettings: object({ Url: { type: 'string' }, X: { type: 'string' } }),
        SecondSettings: object({ Url: { type: 'string' }, X: { type: 'string' } }),
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
      properties: { First: { $ref: '#/definitions/A' }, Second: { $ref: '#/definitions/B' } },
      definitions: {
        A: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
        B: object({ Url: { type: 'string' } }),
      },
    });
    importRegistry(db, {
      properties: { First: { $ref: '#/definitions/C' }, Second: { $ref: '#/definitions/C' } },
      definitions: { C: object({ Url: { type: 'string' }, Port: { type: 'integer' } }) },
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
        First: { $ref: '#/definitions/FirstSettings' },
        Second: { $ref: '#/definitions/SecondSettings' },
        Third: { $ref: '#/definitions/FirstSettings' },
      },
      definitions: {
        FirstSettings: object({ Url: { type: 'string' } }),
        SecondSettings: object({ Url: { type: 'string' } }),
      },
    });
    importRegistry(db, {
      properties: {
        First: { $ref: '#/definitions/Settings' },
        Second: { $ref: '#/definitions/Settings' },
        Third: { $ref: '#/definitions/FirstSettings' },
      },
      definitions: {
        Settings: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
        FirstSettings: object({ Url: { type: 'string' } }),
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

  test('a released type merged with one whose split follows CloudFormation follows it too', () => {
    // A is split into C and D, and D has Port; B is merged with A into C, which has nothing new
    importRegistry(released, {
      properties: {
        First: { $ref: '#/definitions/A' },
        Second: { $ref: '#/definitions/B' },
        Third: { $ref: '#/definitions/A' },
      },
      definitions: { A: object({ Url: { type: 'string' } }), B: object({ Url: { type: 'string' } }) },
    });
    importRegistry(db, {
      properties: {
        First: { $ref: '#/definitions/C' },
        Second: { $ref: '#/definitions/C' },
        Third: { $ref: '#/definitions/D' },
      },
      definitions: {
        C: object({ Url: { type: 'string' } }),
        D: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
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
      properties: { First: { $ref: '#/definitions/Shared' }, Second: { $ref: '#/definitions/Shared' } },
      definitions: { Shared: object({ Url: { type: 'string' } }) },
    });
    importRegistry(db, {
      properties: { First: { $ref: '#/definitions/Shared' }, Second: { $ref: '#/definitions/SecondSettings' } },
      definitions: {
        Shared: object({ Url: { type: 'string' } }),
        SecondSettings: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
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
      properties: { First: { $ref: '#/definitions/Shared' }, Second: { $ref: '#/definitions/Shared' } },
      definitions: { Shared: object({ Url: { type: 'string' } }) },
    });
    importRegistry(db, {
      properties: { First: { $ref: '#/definitions/FirstSettings' }, Second: { $ref: '#/definitions/SecondSettings' } },
      definitions: {
        FirstSettings: object({ Url: { type: 'string' } }),
        SecondSettings: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
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
          Second: { $ref: '#/definitions/X' },
          ...(withT ? { Q: { $ref: '#/definitions/T' }, Q2: { $ref: '#/definitions/T' } } : {}),
        },
        definitions: {
          T: object({ Inner: { $ref: '#/definitions/X' }, Name: { type: 'string' } }),
          X: object({ Url: { type: 'string' }, Sub: { $ref: '#/definitions/Leaf' } }),
          Leaf: object({ A: { type: 'string' } }),
        },
      });
      importRegistry(db, {
        properties: {
          Second: { $ref: '#/definitions/Y' },
          ...(withT ? { Q: { $ref: '#/definitions/T2' }, Q2: { $ref: '#/definitions/T' } } : {}),
        },
        definitions: {
          Y: object({ Url: { type: 'string' }, Sub: { $ref: '#/definitions/Leaf2' } }),
          Leaf2: object({ A: { type: 'string' }, B: { type: 'string' } }),
          T2: object({ Inner: { $ref: '#/definitions/Z' }, Name: { type: 'string' }, Extra: { type: 'string' } }),
          T: object({ Name: { type: 'string' } }),
          Z: object(zFields),
        },
      });
    };

    test.each([
      ['alone', false, true, []],
      ['below a type that switches, where X would gain a field there', true, true, ['T -> T2 at property Q']],
      ['below a type that switches, where X would need other fields there', true, false, ['T -> T2 at property Q']],
    ])('keeps the positions below it %s', (_, withT, zNew, switches) => {
      const url = { Url: { type: 'string' as const } };
      setup(withT as boolean, zNew ? { ...url, New: { type: 'string' } } : url);

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
        properties: { PA: { $ref: '#/definitions/A' }, PB: { $ref: '#/definitions/B' } },
        definitions: {
          A: object({ Url: { type: 'string' }, InnerB: { $ref: '#/definitions/B' } }),
          B: object({ Name: { type: 'string' }, Inner: { $ref: '#/definitions/A' } }),
        },
      });
      importRegistry(db, {
        properties: { PA: { $ref: '#/definitions/A1' }, PB: { $ref: '#/definitions/B1' } },
        definitions: {
          A1: object({ Url: { type: 'string' }, InnerB: { $ref: '#/definitions/B2' } }),
          A2: object({ Url: { type: 'string' }, New: { type: 'string' }, InnerB: { $ref: '#/definitions/B1' } }),
          B1: object({ Name: { type: 'string' }, Inner: { $ref: '#/definitions/A2' } }),
          B2: object({ Name: { type: 'string' }, New: { type: 'string' }, Inner: { $ref: '#/definitions/A1' } }),
        },
      });
    };

    const first = runFresh(setup);
    expect(cases(first)).toEqual([
      'interdependent A at property PA, property PB.Inner',
      'interdependent B at property PA.InnerB, property PB',
    ]);
    expect(gateFails(first)).toBe(true);
    expect(typeGate(first, { mappingFile: MAPPING_FILE, baselineVersion: '1.2.3' }).entries).toContain(
      `${RESOURCE}: A is interdependent`,
    );

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
        properties: { Top: { $ref: '#/definitions/Node' }, Pt2: { $ref: '#/definitions/P' } },
        definitions: {
          Node: object({
            Name: { type: 'string' },
            Child: { $ref: '#/definitions/Node' },
            Extra: { $ref: '#/definitions/P' },
          }),
          P: object({ Name: { type: 'string' }, N: { $ref: '#/definitions/Node' } }),
        },
      });
      importRegistry(db, {
        properties: { Top: { $ref: '#/definitions/NodeA' }, Pt2: { $ref: '#/definitions/PY' } },
        definitions: {
          NodeA: object({
            Name: { type: 'string' },
            Child: { $ref: '#/definitions/NodeB' },
            Extra: { $ref: '#/definitions/PX' },
          }),
          NodeB: object({ Name: { type: 'string' }, New: { type: 'string' } }),
          PX: object({ Name: { type: 'string' }, New: { type: 'string' } }),
          PY: object({ Name: { type: 'string' }, N: { $ref: '#/definitions/NodeC' } }),
          NodeC: object({ Name: { type: 'string' }, New: { type: 'string' } }),
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

  describe('a merge or split whose positions need different fields, with nothing new, also follows CloudFormation', () => {
    // Released Shared {Url, Port}; CloudFormation keeps Shared {Url, Port} at First and renames Second to a type
    // without Port
    const fewerFields = (extra: Partial<CloudFormationRegistryResource> = {}) => {
      importRegistry(released, {
        properties: { First: { $ref: '#/definitions/Shared' }, Second: { $ref: '#/definitions/Shared' } },
        definitions: { Shared: object({ Url: { type: 'string' }, Port: { type: 'integer' } }) },
      });
      importRegistry(db, {
        properties: {
          First: { $ref: '#/definitions/Shared' },
          Second: { $ref: '#/definitions/SecondSettings' },
          ...extra.properties,
        },
        definitions: {
          Shared: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
          SecondSettings: object({ Url: { type: 'string' } }),
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
          First: { $ref: '#/definitions/FirstSettings' },
          Second: { $ref: '#/definitions/SecondSettings' },
          Third: { $ref: '#/definitions/FirstSettings' },
        },
        definitions: {
          FirstSettings: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
          SecondSettings: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
        },
      });
      importRegistry(db, {
        properties: {
          First: { $ref: '#/definitions/Settings' },
          Second: { $ref: '#/definitions/Settings' },
          Third: { $ref: '#/definitions/FirstSettings' },
        },
        definitions: {
          Settings: object({ Url: { type: 'string' } }),
          FirstSettings: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
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
          First: { $ref: '#/definitions/A' },
          Second: { $ref: '#/definitions/B' },
          Third: { $ref: '#/definitions/A' },
        },
        definitions: {
          A: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
          B: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
        },
      });
      importRegistry(db, {
        properties: { First: { $ref: '#/definitions/C' }, Second: { $ref: '#/definitions/C' }, Third: {} },
        definitions: { C: object({ Url: { type: 'string' } }) },
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
          First: { $ref: '#/definitions/A' },
          Second: { $ref: '#/definitions/B' },
          Third: { $ref: '#/definitions/A' },
        },
        definitions: {
          A: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
          B: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
        },
      });
      importRegistry(db, {
        properties: {
          First: { $ref: '#/definitions/C' },
          Second: { $ref: '#/definitions/C' },
          Third: { $ref: '#/definitions/Options' },
        },
        definitions: { C: object({ Url: { type: 'string' } }), Options: object({ Name: { type: 'string' } }) },
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
      expect(result.applied.map((a) => `${a.entry.kind} ${a.entry.oldType}`)).toEqual(['keep-old Shared']);
      expect(history(resource(db).properties.Second)[0]).toEqual('Shared');
      expect(fields('Shared')).toEqual({ Url: 'string', Port: 'integer' });
      expect(l1Renames()).toEqual([]);
    });

    test('follows CloudFormation where its entry applies to none of its positions', () => {
      // The entry names Other, which CloudFormation uses at Third only, so it decides nothing for Shared
      fewerFields({
        properties: { Third: { $ref: '#/definitions/Other' } },
        definitions: { Other: object({ Name: { type: 'string' } }) },
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
      expect(renderedFields('Checks')).toEqual({ A: 'Check', B: 'Check', C: 'CustomCheck' });
      expect(fields('Check')).toEqual({ Enabled: 'boolean' });
      expect(l1Renames()).toEqual(['Check -> CustomCheck at field Checks.C']);

      const gate = typeGate(result, { mappingFile: MAPPING_FILE, baselineVersion: '1.2.3' });
      expect(gate.failed).toBe(false);
      expect(gate.report).toContain(`  ${RESOURCE}: Check -> CustomCheck (property Checks.C)`);
    });

    test('keeps the released name everywhere with a keep-old entry', () => {
      const result = runFresh(setup, [
        mapping({ resource: RESOURCE, oldType: 'Check', newTypes: ['CustomCheck'], kind: 'keep-old' }),
      ]);

      expect(cases(result)).toEqual([]);
      expect(switched(result)).toEqual([]);
      expect(renderedFields('Checks')).toEqual({ A: 'Check', B: 'Check', C: 'Check' });
      expect(fields('Check')).toEqual({ Enabled: 'boolean', Configuration: 'string' });
      expect(l1Renames()).toEqual([]);
    });
  });
});

describe('settled renames whose current type shares fewer than half of the released fields', () => {
  const strings = (names: string[]) => Object.fromEntries(names.map((n) => [n, { type: 'string' as const }]));
  const setup = (releasedFields: string[], currentFields: string[]) => {
    importRegistry(released, {
      properties: { Settings: { $ref: '#/definitions/Old' } },
      definitions: { Old: object(strings(releasedFields)) },
    });
    importRegistry(db, {
      properties: { Settings: { $ref: '#/definitions/New' } },
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
    const gate = typeGate(result, { mappingFile: MAPPING_FILE, baselineVersion: '1.2.3' });
    expect(gate.failed).toBe(false);
    expect(gate.report).toContain(`  ${RESOURCE}: Old -> New shares ${count} released fields (property Settings)`);
  });

  test.each([
    ['all fields', ['A', 'B'], ['A', 'B']],
    ['exactly half', ['A', 'B', 'C', 'D'], ['A', 'B', 'X']],
  ])('are not listed when they share %s', (_, releasedFields, currentFields) => {
    setup(releasedFields, currentFields);

    const result = run();

    expect(settled(result)).toEqual(['rename Old -> New at property Settings']);
    expect(result.weak).toEqual([]);
    expect(typeGate(result, { mappingFile: MAPPING_FILE, baselineVersion: '1.2.3' }).report).not.toContain('Weak');
  });

  test('are listed once per current type of a split', () => {
    importRegistry(released, {
      properties: { First: { $ref: '#/definitions/Shared' }, Second: { $ref: '#/definitions/Shared' } },
      definitions: { Shared: object(strings(['A', 'B', 'C', 'D', 'E'])) },
    });
    importRegistry(db, {
      properties: { First: { $ref: '#/definitions/One' }, Second: { $ref: '#/definitions/Two' } },
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
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: object({ Url: { type: 'string' } }) },
    });
    importRegistry(db, {
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: object({ Url: { type: 'string' }, Port: { type: 'integer' } }, ['Port']) },
    });

    run();

    expect(fields('Settings')).toEqual({ Url: 'string', Port: 'integer (required)' });
  });

  test('a kept field that became required renders required', () => {
    importRegistry(released, {
      properties: { Settings: { $ref: '#/definitions/SettingsRequest' } },
      definitions: { SettingsRequest: object({ Url: { type: 'string' } }) },
    });
    importRegistry(db, {
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: object({ Url: { type: 'string' } }, ['Url']) },
    });

    run();

    expect(fields('SettingsRequest')).toEqual({ Url: 'string (required)' });
  });

  test('a field of a shared type is required only where CloudFormation requires it at every position', () => {
    importRegistry(released, {
      properties: { First: { $ref: '#/definitions/Shared' }, Second: { $ref: '#/definitions/Shared' } },
      definitions: { Shared: object({ Url: { type: 'string' } }) },
    });
    importRegistry(db, {
      properties: { First: { $ref: '#/definitions/FirstSettings' }, Second: { $ref: '#/definitions/SecondSettings' } },
      definitions: {
        FirstSettings: object({ Url: { type: 'string' } }, ['Url']),
        SecondSettings: object({ Url: { type: 'string' } }),
      },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(fields('Shared')).toEqual({ Url: 'string' });
  });
});

describe('a kept struct below a list or map change', () => {
  const urlPort = () => object({ Url: { type: 'string' }, Port: { type: 'integer' } });
  const urlMode = () => object({ Url: { type: 'string' }, Mode: { type: 'string' } }, ['Mode']);

  test('takes the fields of the struct CloudFormation put into a list', () => {
    importRegistry(released, {
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: urlPort() },
    });
    importRegistry(db, {
      properties: { Settings: { type: 'array', items: { $ref: '#/definitions/Settings' } } },
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
      properties: { Settings: { type: 'array', items: { $ref: '#/definitions/Settings' } } },
      definitions: { Settings: urlPort() },
    });
    importRegistry(db, {
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: urlMode() },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(history(resource(db).properties.Settings)).toEqual(['Array<Settings>', 'Settings']);
    expect(fields('Settings')).toEqual({ Url: 'string', Mode: 'string (required)' });
  });

  test('takes the fields of the struct CloudFormation put into a map', () => {
    importRegistry(released, {
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: urlPort() },
    });
    importRegistry(db, {
      properties: {
        Settings: { type: 'object', patternProperties: { '.*': { $ref: '#/definitions/Settings' } } } as any,
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
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: urlPort() },
    });
    // Another region still has the field in a struct outside a list
    importRegistry(
      db,
      { properties: { Settings: { $ref: '#/definitions/OldSettings' } }, definitions: { OldSettings: urlPort() } },
      RESOURCE,
      'region-1',
    );
    importRegistry(
      db,
      {
        properties: { Settings: { type: 'array', items: { $ref: '#/definitions/Settings' } } },
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
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: urlPort() },
    });
    importRegistry(db, {
      properties: { Settings: { type: 'array', items: { $ref: '#/definitions/NewSettings' } } },
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
      properties: { Settings: { $ref: '#/definitions/Settings' }, Backup: { $ref: '#/definitions/Dest' } },
      definitions: {
        Settings: object({ Url: { type: 'string' } }),
        Dest: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
      },
    });
    importRegistry(db, {
      properties: {
        Settings: { type: 'array', items: { $ref: '#/definitions/Settings' } },
        Backup: { $ref: '#/definitions/DestRequest' },
      },
      definitions: {
        Settings: object({ Url: { type: 'string' }, Extra: { $ref: '#/definitions/Dest' } }),
        DestRequest: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
        Dest: object({ State: { type: 'string' } }),
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
    ['reused by a field the L1 does not render', { Dest: object({ State: { type: 'string' } }) }],
    ['not reused', { Other: object({ State: { type: 'string' } }) }],
  ])('a rename stays settled where its released name is %s', (_, extraDefinition) => {
    // CloudFormation's Settings is now a union, so the kept Settings keeps exactly its released fields and the L1
    // does not render Extra
    const extraType = Object.keys(extraDefinition)[0];
    importRegistry(released, {
      properties: { Settings: { $ref: '#/definitions/Settings' }, Backup: { $ref: '#/definitions/Dest' } },
      definitions: {
        Settings: object({ Url: { type: 'string' } }),
        Dest: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
      },
    });
    importRegistry(db, {
      properties: {
        Settings: { anyOf: [{ $ref: '#/definitions/Settings' }, { type: 'string' }] },
        Backup: { $ref: '#/definitions/DestRequest' },
      },
      definitions: {
        Settings: object({ Url: { type: 'string' }, Extra: { $ref: `#/definitions/${extraType}` } }),
        DestRequest: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
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
      anyOf: [{ $ref: '#/definitions/SettingsV2' }, { type: 'string' }],
    } as any;
    const shapes: Array<[string, jsonschema.Schema]> = [
      ['a union', settingsV2OrString],
      ['a list of a union', { type: 'array', items: settingsV2OrString } as any],
      ['a map of a union', { type: 'object', patternProperties: { '.*': settingsV2OrString } } as any],
    ];
    const setup = (settings: jsonschema.Schema, nested: boolean, property = 'Top') => {
      const inOuter = (s: jsonschema.Schema): jsonschema.Schema => (nested ? { $ref: '#/definitions/Outer' } : s);
      const releasedSettings: jsonschema.Schema = { $ref: '#/definitions/Settings' };
      importRegistry(released, {
        properties: { [property]: inOuter(releasedSettings), Backup: { $ref: '#/definitions/Dest' } },
        definitions: {
          ...(nested ? { Outer: object({ Settings: releasedSettings }) } : {}),
          Settings: object({ Url: { type: 'string' } }),
          Dest: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
        },
      });
      importRegistry(db, {
        properties: { [property]: inOuter(settings), Backup: { $ref: '#/definitions/DestRequest' } },
        definitions: {
          ...(nested ? { Outer: object({ Settings: settings }) } : {}),
          SettingsV2: object({ Url: { type: 'string' }, Extra: { $ref: '#/definitions/Dest' } }),
          DestRequest: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
          Dest: object({ State: { type: 'string' } }),
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

    test('a rename stays settled where the tag property turns into a union', () => {
      // The tag property renders only the oldest type of its history, so nothing renders SettingsV2
      setup(settingsV2OrString, false, 'Tags');

      const result = run();

      expect(resource(db).tagInformation?.tagPropertyName).toEqual('Tags');
      expect(new L1View(db, resource(db)).structs.has('SettingsV2')).toBe(false);
      expect(cases(result)).toEqual([]);
      expect(settled(result)).toEqual(['rename Dest -> DestRequest at property Backup']);
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
      { Other: { $ref: '#/definitions/Mid' } },
      ['Dest -> DestRequest at property Backup'],
      [],
      { State: 'string' },
    ],
  ])('a released name reused two levels below a union position is compared %s', (_, other, switches, renames, dest) => {
    // The kept Settings keeps exactly {Url}, so the L1 renders neither Extra nor Mid.Inner below it
    importRegistry(released, {
      properties: { Settings: { $ref: '#/definitions/Settings' }, Backup: { $ref: '#/definitions/Dest' } },
      definitions: {
        Settings: object({ Url: { type: 'string' } }),
        Dest: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
      },
    });
    importRegistry(db, {
      properties: {
        Settings: { anyOf: [{ $ref: '#/definitions/Settings' }, { type: 'string' }] },
        Backup: { $ref: '#/definitions/DestRequest' },
        ...other,
      },
      definitions: {
        Settings: object({ Url: { type: 'string' }, Extra: { $ref: '#/definitions/Mid' } }),
        Mid: object({ Inner: { $ref: '#/definitions/Dest' } }),
        Dest: object({ State: { type: 'string' } }),
        DestRequest: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
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
      properties: { Settings: { $ref: '#/definitions/Settings' }, Backup: { $ref: '#/definitions/Dest' } },
      definitions: {
        Settings: object({ Url: { type: 'string' } }),
        Dest: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
      },
    });
    importRegistry(db, {
      properties: {
        Settings: { anyOf: [{ $ref: '#/definitions/Settings' }, { type: 'string' }] },
        Backup: {},
        Other: { $ref: '#/definitions/Wrap' },
      },
      definitions: {
        Settings: object({ Url: { type: 'string' }, Extra: { $ref: '#/definitions/Mid' } }),
        Wrap: object({ W: { $ref: '#/definitions/Mid' } }),
        Mid: object({ Inner: { $ref: '#/definitions/Dest' } }),
        Dest: object({ State: { type: 'string' } }),
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
        Settings: { $ref: '#/definitions/Settings' },
        Backup: { $ref: '#/definitions/Dest' },
        Other: { $ref: '#/definitions/Foo' },
      },
      definitions: {
        Settings: object({ Url: { type: 'string' } }),
        Dest: object({ Url: { type: 'string' } }),
        Foo: object({ A: { type: 'string' }, B: { type: 'string' } }),
      },
    });
    importRegistry(db, {
      properties: {
        Settings: { anyOf: [{ $ref: '#/definitions/Settings' }, { type: 'string' }] },
        Backup: { $ref: '#/definitions/DestRequest' },
        Other: { $ref: '#/definitions/FooRequest' },
      },
      definitions: {
        Settings: object({ Url: { type: 'string' }, Extra: { $ref: '#/definitions/Dest' } }),
        Dest: object({ Url: { type: 'string' }, X: { $ref: '#/definitions/Foo' } }),
        Foo: object({ A: { type: 'string' }, C: { type: 'string' } }),
        DestRequest: object({ Url: { type: 'string' }, X: { type: 'string' } }),
        FooRequest: object({ A: { type: 'string' } }),
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
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: object({ Target: { $ref: '#/definitions/OldTarget' } }), OldTarget: arn() },
    });
    importRegistry(db, {
      properties: { Settings: { type: 'array', items: { $ref: '#/definitions/Settings' } } },
      definitions: { Settings: object({ Target: { $ref: '#/definitions/NewTarget' } }), NewTarget: arn() },
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
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: object({ Target: { $ref: '#/definitions/OldTarget' } }), OldTarget: arn() },
    });
    importRegistry(db, {
      properties: { Settings: { type: 'array', items: { $ref: '#/definitions/Settings' } } },
      definitions: {
        Settings: object({ Target: { $ref: '#/definitions/NewTarget' } }),
        NewTarget: object({ Url: { type: 'string' } }),
      },
    });

    const result = run();

    expect(cases(result)).toEqual(['no-pair OldTarget at property Settings.Target']);
    expect(history(typeDefinition('Settings').properties.Target)[0]).toEqual('OldTarget');
  });

  test('a struct below a position whose CloudFormation type has another shape keeps its released history', () => {
    importRegistry(released, {
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: object({ Target: { $ref: '#/definitions/OldTarget' } }), OldTarget: arn() },
    });
    importRegistry(db, {
      properties: { Settings: { anyOf: [{ $ref: '#/definitions/Settings' }, { type: 'string' }] } },
      definitions: { Settings: object({ Target: { $ref: '#/definitions/NewTarget' } }), NewTarget: arn() },
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
      properties: { Settings: { $ref: '#/definitions/Destination' } },
      definitions: { Destination: object({ Url: { type: 'string' }, Port: { type: 'integer' } }) },
    });
    importRegistry(db, {
      properties: {
        Settings: { $ref: '#/definitions/DestinationRequest' },
        Status: { $ref: '#/definitions/Destination' },
      },
      definitions: {
        DestinationRequest: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
        Destination: object({ State: { type: 'string' } }),
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
      properties: { Settings: { $ref: '#/definitions/Settings' }, Backup: { $ref: '#/definitions/Dest' } },
      definitions: {
        Settings: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
        Dest: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
      },
    });
    importRegistry(db, {
      properties: { Settings: { $ref: '#/definitions/Settings' }, Backup: { $ref: '#/definitions/DestRequest' } },
      definitions: {
        Settings: object({ Url: { type: 'string' }, Extra: { $ref: '#/definitions/Dest' } }),
        DestRequest: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
        Dest: object({ State: { type: 'string' } }),
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
      const inOuter = (s: jsonschema.Schema): jsonschema.Schema => (nested ? { $ref: '#/definitions/Outer' } : s);
      const releasedTarget: jsonschema.Schema = {
        anyOf: [{ $ref: '#/definitions/Queue' }, { $ref: '#/definitions/Topic' }],
      } as any;
      const currentTarget: jsonschema.Schema = {
        anyOf: [{ $ref: '#/definitions/SqsTarget' }, { $ref: '#/definitions/SnsTarget' }],
      } as any;
      importRegistry(released, {
        properties: { Top: inOuter(releasedTarget), Backup: { $ref: '#/definitions/Dest' } },
        definitions: {
          ...(nested ? { Outer: object({ Target: releasedTarget }) } : {}),
          Queue: object({ Arn: { type: 'string' } }),
          Topic: object({ Url: { type: 'string' } }),
          Dest: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
        },
      });
      importRegistry(db, {
        properties: { Top: inOuter(currentTarget), Backup: { $ref: '#/definitions/DestRequest' } },
        definitions: {
          ...(nested ? { Outer: object({ Target: currentTarget }) } : {}),
          SqsTarget: object({ Arn: { type: 'string' }, Extra: { $ref: '#/definitions/Dest' } }),
          SnsTarget: object({ Url: { type: 'string' } }),
          DestRequest: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
          Dest: object({ State: { type: 'string' } }),
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
      properties: { Settings: { $ref: '#/definitions/Destination' } },
      definitions: { Destination: object({ Url: { type: 'string' } }) },
    });
    importRegistry(db, {
      properties: { Settings: { $ref: '#/definitions/Destination' }, Backup: { $ref: '#/definitions/Destination' } },
      definitions: { Destination: object({ Url: { type: 'string' } }) },
    });

    const result = run();

    expect(cases(result)).toEqual([]);
    expect(fields('Destination')).toEqual({ Url: 'string' });
  });

  test('takes the field types of its own positions where CloudFormation gives its name to another renamed struct', () => {
    // At First the L1 renders A, so CloudFormation's B there types none of the kept B's fields
    importRegistry(released, {
      properties: { First: { $ref: '#/definitions/A' }, Second: { $ref: '#/definitions/B' } },
      definitions: { A: object({ X: { type: 'string' } }), B: object({ Y: { type: 'string' } }) },
    });
    importRegistry(db, {
      properties: { First: { $ref: '#/definitions/B' }, Second: { $ref: '#/definitions/C' } },
      definitions: {
        B: object({ X: { type: 'string' }, M: { type: 'string' } }),
        C: object({ Y: { type: 'string' }, M: { type: 'integer' } }),
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
        First: { $ref: '#/definitions/A' },
        Second: { $ref: '#/definitions/B' },
        Third: { $ref: '#/definitions/Dest' },
      },
      definitions: {
        A: object({ X: { type: 'string' } }),
        B: object({ Y: { type: 'string' } }),
        Dest: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
      },
    });
    importRegistry(db, {
      properties: {
        First: { $ref: '#/definitions/B' },
        Second: { $ref: '#/definitions/C' },
        Third: { $ref: '#/definitions/DestRequest' },
      },
      definitions: {
        B: object({ X: { type: 'string' }, N: { $ref: '#/definitions/Dest' } }),
        C: object({ Y: { type: 'string' } }),
        DestRequest: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
        Dest: object({ State: { type: 'string' } }),
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
      properties: { Settings: { $ref: '#/definitions/Destination' } },
      definitions: { Destination: object({ Url: { type: 'string' }, Port: { type: 'integer' } }) },
    });
    importRegistry(db, {
      properties: {
        Settings: { $ref: '#/definitions/DestinationRequest' },
        Status: { $ref: '#/definitions/Status' },
      },
      readOnlyProperties: ['/properties/Status'],
      definitions: {
        DestinationRequest: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
        Status: object({ Last: { $ref: '#/definitions/Destination' } }),
        Destination: object({ State: { type: 'string' } }),
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
    importRegistry(db, { properties: { Name: { type: 'string' } } });

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
      properties: { Name: { type: 'string' }, Other: { $ref: '#/definitions/Unused' } },
      definitions: { Unused: object({ Url: { type: 'string' } }) },
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
      properties: { Name: { type: 'string' }, Other: { $ref: '#/definitions/Unused' } },
      definitions: { Unused: object({ Url: { type: 'string' } }) },
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
    properties: { Settings: { $ref: '#/definitions/Settings' } },
    definitions: { Settings: object({ Target: { $ref: '#/definitions/OldTarget' } }), OldTarget: arn() },
  };
  const otherOldTarget = {
    Other: { $ref: '#/definitions/OldTarget' },
  };
  const otherOldTargetDefinition = { OldTarget: object({ State: { type: 'string' } }) };

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
      properties: { Settings: { anyOf: [{ $ref: '#/definitions/Settings' }, { type: 'string' }] }, ...otherOldTarget },
      definitions: {
        Settings: object({ Target: { $ref: '#/definitions/NewTarget' } }),
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
      properties: { Settings: { $ref: '#/definitions/Options' }, ...otherOldTarget },
      definitions: { Options: object({ Name: { type: 'string' } }), ...otherOldTargetDefinition },
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
        properties: { Settings: { $ref: '#/definitions/Settings' }, Backup: { $ref: '#/definitions/OldTarget' } },
        definitions: { Settings: object({ Target: { $ref: '#/definitions/OldTarget' } }), OldTarget: arn() },
      });
      importRegistry(db, {
        properties: { Settings: {}, Backup: { $ref: '#/definitions/NewTarget' } },
        definitions: { NewTarget: object({ Arn: { type: 'string' }, Region: { type: 'string' } }) },
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
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: {
        Settings: object({ Target: { $ref: '#/definitions/OldTarget' } }),
        OldTarget: object({ Arn: { type: 'string' } }, ['Arn']),
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
      properties: { Settings: { $ref: '#/definitions/Settings' }, Hidden: { $ref: '#/definitions/Hidden' } },
      definitions: {
        Settings: object({ Inner: { $ref: '#/definitions/Inner' } }),
        Inner: object({ Value: {} }),
        Hidden: object({ Url: { type: 'string' } }),
      },
    });
    importRegistry(db, {
      properties: { Settings: {}, Hidden: { anyOf: [{ $ref: '#/definitions/Hidden' }, { type: 'string' }] } },
      definitions: {
        Hidden: object({ Url: { type: 'string' }, Extra: { $ref: '#/definitions/Inner' } }),
        Inner: object({ Value: { type: 'string' } }),
      },
    });

    const result = run();

    expect(history(typeDefinition('Inner').properties.Value)).toEqual(['json']);
    expect(cases(result)).toEqual([]);
    expect(l1Changes()).toEqual([]);
  });
});

function arn() {
  return object({ Arn: { type: 'string' } });
}

function importLegacySpec(
  target: SpecDatabase,
  options: { properties: Record<string, resourcespec.Property>; types: Record<string, resourcespec.PropertyType> },
) {
  ResourceSpecImporter.importTypes({
    db: target,
    specification: {
      ResourceSpecificationVersion: '0',
      ResourceTypes: { [RESOURCE]: { Properties: options.properties } },
      PropertyTypes: Object.fromEntries(
        Object.entries(options.types).map(([name, decl]) => [`${RESOURCE}.${name}`, decl]),
      ),
    },
  });
}

function divergingChecks(cType: 'Check' | 'CustomCheck'): Partial<CloudFormationRegistryResource> {
  return {
    properties: { Checks: { $ref: '#/definitions/Checks' } },
    definitions: {
      Checks: object({
        A: { $ref: '#/definitions/Check' },
        B: { $ref: '#/definitions/Check' },
        C: { $ref: `#/definitions/${cType}` },
      }),
      Check: object({ Enabled: { type: 'boolean' } }),
      CustomCheck: object({ Enabled: { type: 'boolean' }, Configuration: { type: 'string' } }),
    },
  };
}

function labels() {
  return object({ Labels: map() });
}

function map(): jsonschema.Schema {
  return { type: 'object', patternProperties: { '.*': { type: 'string' } } } as any;
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

function gateFails(result: TypeHistoryResult) {
  return typeGate(result, { mappingFile: MAPPING_FILE, baselineVersion: '1.2.3' }).failed;
}

function l1Changes() {
  const changes = compareL1(released, db);
  return [...changes.renames, ...changes.removed, ...changes.requiredness, ...changes.other];
}

function importRegistry(
  target: SpecDatabase,
  schema: Partial<CloudFormationRegistryResource>,
  typeName = RESOURCE,
  region?: string,
) {
  importCloudFormationRegistryResource({
    db: target,
    report: new ProblemReport(),
    region,
    resource: {
      typeName,
      description: 'Test resource',
      properties: {},
      ...schema,
    } as CloudFormationRegistryResource,
  });
}

function object(properties: jsonschema.ObjectProperties, required?: string[]): jsonschema.RecordLikeObject {
  return { type: 'object', properties, required, additionalProperties: false };
}

function resource(target: SpecDatabase, typeName = RESOURCE) {
  return target.lookup('resource', 'cloudFormationType', 'equals', typeName).only();
}

function typeDefinition(name: string) {
  return resourceTypeDefinition(db, name);
}

function resourceTypeDefinition(target: SpecDatabase, name: string) {
  const found = target
    .follow('usesType', resource(target))
    .map((x) => x.entity)
    .filter((t) => t.name === name);
  expect(found).toHaveLength(1);
  return found[0];
}

function rendersType(name: string) {
  const types = new Set<string>();
  const add = (prop: Pick<Property, 'type' | 'previousTypes'>) => {
    for (const t of new RichProperty(prop as Property).types()) {
      types.add(new RichPropertyType(t).stringify(db, false));
    }
  };
  for (const prop of Object.values(resource(db).properties)) {
    add(prop);
  }
  return [...types].some((t) => t.includes(name));
}

function renderedFields(typeName: string) {
  return Object.fromEntries(
    Object.entries(typeDefinition(typeName).properties).map(([name, prop]) => [name, history(prop)[0]]),
  );
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
