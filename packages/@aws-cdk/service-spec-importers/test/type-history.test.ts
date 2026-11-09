import { emptyDatabase, Property, RichProperty, RichPropertyType, SpecDatabase } from '@aws-cdk/service-spec-types';
import { importCloudFormationRegistryResource } from '../src/importers/import-cloudformation-registry';
import { ResourceSpecImporter } from '../src/importers/import-resource-spec';
import { importTypeHistory, TypeHistoryResult, UndecidedCase } from '../src/importers/import-type-history';
import { compareL1 } from '../src/l1-changes';
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

  test('a merged released type that is also used where its current type has other fields is an unsettled merge', () => {
    const setup = () => {
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
    };

    const first = runFresh(setup);
    expect(cases(first)).toEqual(['unsettled-merge FirstSettings at property First, property Third']);
    expect(kinds(first.undecided[0])).toEqual(['merge', 'split', 'keep-old', 'follow-cloudformation']);

    const second = runFresh(setup, [chosen(first, 'merge')]);
    expect(cases(second)).toEqual([]);
    expect(history(resource(db).properties.First)).toEqual(['FirstSettings', 'Settings']);
    expect(history(resource(db).properties.Third)).toEqual(['FirstSettings']);
    expect(fields('FirstSettings')).toEqual({ Url: 'string', Port: 'integer' });
    expect(fields('SecondSettings')).toEqual({ Url: 'string', Port: 'integer' });
  });

  test('a shared type renamed at one position to a type with fewer fields is an unsettled split', () => {
    const setup = () => {
      importRegistry(released, {
        properties: { First: { $ref: '#/definitions/Shared' }, Second: { $ref: '#/definitions/Shared' } },
        definitions: { Shared: object({ Url: { type: 'string' }, Port: { type: 'integer' } }) },
      });
      importRegistry(db, {
        properties: { First: { $ref: '#/definitions/Shared' }, Second: { $ref: '#/definitions/SecondSettings' } },
        definitions: {
          Shared: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
          SecondSettings: object({ Url: { type: 'string' } }),
        },
      });
    };

    const first = runFresh(setup);
    expect(cases(first)).toEqual(['unsettled-split Shared at property First, property Second']);
    expect(first.undecided[0].entries.map((e) => `${e.kind} ${e.newTypes.join(',')}`)).toEqual([
      'split SecondSettings',
      'keep-old SecondSettings',
      'follow-cloudformation SecondSettings',
    ]);

    const second = runFresh(setup, [chosen(first, 'split')]);
    expect(cases(second)).toEqual([]);
    expect(history(resource(db).properties.First)).toEqual(['Shared']);
    expect(history(resource(db).properties.Second)).toEqual(['SecondSettings']);
    expect(fields('Shared')).toEqual({ Url: 'string', Port: 'integer' });
  });

  test.each([
    ['keep-old', { A: 'Check', B: 'Check', C: 'Check' }, { Enabled: 'boolean', Configuration: 'string' }],
    ['follow-cloudformation', { A: 'Check', B: 'Check', C: 'CustomCheck' }, { Enabled: 'boolean' }],
  ])(
    'a shared type whose CloudFormation types at kept positions need different fields diverges (%s)',
    (kind, rendered, checkFields) => {
      const setup = () => {
        // The released C renders Check, but its newest type is already CustomCheck
        importRegistry(released, divergingChecks('Check'));
        importRegistry(released, divergingChecks('CustomCheck'));
        importRegistry(db, divergingChecks('CustomCheck'));
      };

      const first = runFresh(setup);
      expect(cases(first)).toEqual(['diverging Check at property Checks.A, property Checks.B, property Checks.C']);
      expect(first.undecided[0].positions).toEqual([
        { position: 'property Checks.A', cloudFormationType: 'Check', fields: ['Enabled'] },
        { position: 'property Checks.B', cloudFormationType: 'Check', fields: ['Enabled'] },
        { position: 'property Checks.C', cloudFormationType: 'CustomCheck', fields: ['Configuration', 'Enabled'] },
      ]);
      expect(first.undecided[0].entries.map((e) => `${e.kind} ${e.newTypes.join(',')}`)).toEqual([
        'split CustomCheck',
        'keep-old CustomCheck',
        'follow-cloudformation CustomCheck',
      ]);

      const second = runFresh(setup, [chosen(first, kind as TypeMappingKind)]);
      expect(cases(second)).toEqual([]);
      expect(renderedFields('Checks')).toEqual(rendered);
      expect(fields('Check')).toEqual(checkFields);
    },
  );

  test('the printed entries are complete and the gate writes them', () => {
    const setup = () => {
      importRegistry(released, divergingChecks('Check'));
      importRegistry(released, divergingChecks('CustomCheck'));
      importRegistry(db, divergingChecks('CustomCheck'));
    };
    const result = runFresh(setup);
    const gate = typeGate(result, { mappingFile: MAPPING_FILE, baselineVersion: '1.2.3' });

    expect(gate.failed).toBe(true);
    expect(gate.entries).toContain(`${RESOURCE}: Check diverges`);
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
    expect(history(resource(db).properties.Burn)[0]).toEqual('BurnSettings');
    expect(history(resource(db).properties.Dvb)[0]).toEqual('DvbSettings');
    expect(settled(result)).toEqual([
      'merge BurnSettings -> BurnDvbSettings at property Burn',
      'merge DvbSettings -> BurnDvbSettings at property Dvb',
    ]);
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

    // The kept Settings renders Extra, so Dest is rendered there with CloudFormation's other fields
    expect(fields('Settings')).toEqual({ Url: 'string', Extra: 'Dest' });
    expect(cases(result)).toEqual(['unsettled-split Dest at property Backup, property Settings.Extra']);
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

  test.each([
    ['only below a field the L1 does not render', {}, []],
    [
      // Other renders Mid, so the L1 renders Dest at Other.Inner with CloudFormation's other fields
      'also at a property the L1 renders',
      { Other: { $ref: '#/definitions/Mid' } },
      ['unsettled-split Dest at property Backup, property Other.Inner'],
    ],
  ])('a released name reused two levels below a union position is compared %s', (_, otherProperty, expected) => {
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
        ...otherProperty,
      },
      definitions: {
        Settings: object({ Url: { type: 'string' }, Extra: { $ref: '#/definitions/Mid' } }),
        Mid: object({ Inner: { $ref: '#/definitions/Dest' } }),
        Dest: object({ State: { type: 'string' } }),
        DestRequest: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
      },
    });

    const result = run();

    expect(cases(result)).toEqual(expected);
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
    const setup = () => {
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
    };

    const first = runFresh(setup);
    expect(cases(first)).toEqual(['unsettled-split Destination at property Settings, property Status']);
    expect(first.undecided[0].positions.map((p) => `${p.position}: ${p.cloudFormationType}`)).toEqual([
      'property Settings: DestinationRequest',
      'property Status: Destination',
    ]);

    const second = runFresh(setup, [chosen(first, 'split')]);
    expect(cases(second)).toEqual([]);
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
    expect(cases(result)).toEqual(['unsettled-split Dest at property Backup, property Settings.Extra']);
  });

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
    expect(cases(first)).toEqual(['unsettled-split OldTarget at property Backup, property Settings.Target']);
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
