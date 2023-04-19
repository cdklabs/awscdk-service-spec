import { PatchReport, formatPatchReport } from '../../src/loading/patching/';

const subject = {
  typeName: 'AWS::Some::Resource',
  properties: {
    SiblingProp: 'foobar',
    AffectedProp: {
      type: 'string',
      description: 'some description',
    },
  },
};

test('can report replace operation', () => {
  const report: PatchReport = {
    fileName: 'some-file.json',
    reason: 'Backwards compatibility',
    subject,
    path: '/properties/AffectedProp',
    patch: {
      op: 'replace',
      path: '/properties/AffectedProp',
      value: {
        type: 'object',
      },
    },
  };

  const print = formatPatchReport(report);

  expect(print).toMatchInlineSnapshot(`
    "some-file.json
    --------------------------------
    /properties/AffectedProp: Backwards compatibility
        {
          "properties": {
            "SiblingProp": "foobar"
    [-]     "AffectedProp": {"type":"string","description":"some description"}
    [+]     "AffectedProp": {"type":"object"}
          }
        }"
  `);
});

test('can report remove operation', () => {
  const report: PatchReport = {
    fileName: 'some-file.json',
    reason: 'Backwards compatibility',
    subject,
    path: '/properties/AffectedProp',
    patch: {
      op: 'remove',
      path: '/properties/AffectedProp',
    },
  };

  const print = formatPatchReport(report);

  expect(print).toMatchInlineSnapshot(`
    "some-file.json
    --------------------------------
    /properties/AffectedProp: Backwards compatibility
        {
          "properties": {
            "SiblingProp": "foobar"
    [-]     "AffectedProp": {"type":"string","description":"some description"}
          }
        }"
  `);
});

test('can report move operation', () => {
  const report: PatchReport = {
    fileName: 'some-file.json',
    reason: 'Backwards compatibility',
    subject,
    path: '/properties/AffectedProp',
    patch: {
      op: 'move',
      from: '/properties/AffectedProp',
      path: '/properties/MovedProp',
    },
  };

  const print = formatPatchReport(report);

  expect(print).toMatchInlineSnapshot(`
    "some-file.json
    --------------------------------
    /properties/AffectedProp: Backwards compatibility
        {
          "properties": {
            "SiblingProp": "foobar"
    [-]     "AffectedProp": {"type":"string","description":"some description"}
    [+]     "MovedProp": {"type":"string","description":"some description"}
          }
        }"
  `);
});

test('can report add operation', () => {
  const report: PatchReport = {
    fileName: 'some-file.json',
    reason: 'Backwards compatibility',
    subject,
    path: '/properties/NewProp',
    patch: {
      op: 'add',
      path: '/properties/NewProp',
      value: {
        type: 'object',
      },
    },
  };

  const print = formatPatchReport(report);

  expect(print).toMatchInlineSnapshot(`
    "some-file.json
    --------------------------------
    /properties/NewProp: Backwards compatibility
        {
          "properties": {
            "SiblingProp": "foobar"
            "AffectedProp": { ... }
    [+]     "NewProp": {"type":"object"}
          }
        }"
  `);
});

test('can report deep add operation', () => {
  const report: PatchReport = {
    fileName: 'some-file.json',
    reason: 'Backwards compatibility',
    subject,
    path: '/properties/AffectedProp',
    patch: {
      op: 'add',
      path: '/properties/AffectedProp/foo',
      value: 'bar',
    },
  };

  const print = formatPatchReport(report);

  expect(print).toMatchInlineSnapshot(`
    "some-file.json
    --------------------------------
    /properties/AffectedProp: Backwards compatibility
        {
          "properties": {
            "AffectedProp": {
              "type": "string"
              "description": "some description"
    [+]       "foo": "bar"
            }
          }
        }"
  `);
});
