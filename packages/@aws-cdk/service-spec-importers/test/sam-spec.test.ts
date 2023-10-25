import { emptyDatabase } from '@aws-cdk/service-spec-types';
import { SAMSpecImporter } from '../src/importers/import-resource-spec';

/**
 * Tests for the CloudFormation spec of SAM
 */

let db: ReturnType<typeof emptyDatabase>;
beforeEach(() => {
  db = emptyDatabase();
});

test('respect InclusivePrimitiveItemTypes even if List is not given', () => {
  SAMSpecImporter.importTypes({
    db,
    specification: {
      ResourceSpecificationVersion: '2016-10-31',
      ResourceSpecificationTransform: 'AWS::Serverless-2016-10-31',
      ResourceTypes: {
        'AWS::Some::Type': {
          Properties: {
            SomeParameter: {
              UpdateType: 'Mutable',
              PrimitiveTypes: ['String'],
              Types: ['Type1'],
              InclusivePrimitiveItemTypes: ['Integer'],
              InclusiveItemTypes: ['Type2'],
            },
          },
        },
      },
      PropertyTypes: {
        'AWS::Some::Type.Type1': {
          Properties: {
            Field: { UpdateType: 'Mutable', PrimitiveType: 'String' },
          },
        },
        'AWS::Some::Type.Type2': {
          Properties: {
            Field: { UpdateType: 'Mutable', PrimitiveType: 'String' },
          },
        },
      },
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type').only();
  expect(resource.properties.SomeParameter.type).toEqual({
    type: 'union',
    types: [
      {
        type: 'string',
      },
      {
        reference: {
          $ref: '2',
        },
        type: 'ref',
      },
      {
        element: {
          type: 'union',
          types: [
            {
              type: 'integer',
            },
            {
              reference: {
                $ref: '3',
              },
              type: 'ref',
            },
          ],
        },
        type: 'array',
      },
    ],
  });
});
