import { forResource, registerServicePatches, replaceDefinition } from './core';
import { patching } from '@aws-cdk/service-spec-importers';

registerServicePatches(
  forResource('AWS::Bedrock::KnowledgeBase', (lens) => {
    const reason = patching.Reason.sourceIssue(
      'StorageConfiguration on AWS::Bedrock::KnowledgeBase resource is being dropped while building source model db due to error importing "oneOf" union type',
    );
    replaceDefinition(
      'StorageConfiguration',
      {
        type: 'object',
        description: 'The vector store service in which the knowledge base is stored.',
        properties: {
          OpensearchServerlessConfiguration: {
            $ref: '#/definitions/OpenSearchServerlessConfiguration',
          },
          PineconeConfiguration: {
            $ref: '#/definitions/PineconeConfiguration',
          },
          RdsConfiguration: {
            $ref: '#/definitions/RdsConfiguration',
          },
          Type: {
            $ref: '#/definitions/KnowledgeBaseStorageType',
          },
        },
        required: ['Type'],
        additionalProperties: false,
      },
      reason,
    )(lens);
  }),
  forResource('AWS::Bedrock::DataSource', (lens) => {
    const reason = patching.Reason.sourceIssue(
      'DataSourceConfiguration on AWS::Bedrock::DataSource resource is being dropped for unknown reason but suppoted by CloudForamtion',
    );
    replaceDefinition(
      "DataSourceConfiguration",
      {
        type: 'object',
        description: 'Specifies a raw data source location to ingest.',
        properties: {
          Type : {
            "$ref" : "#/definitions/DataSourceType"
          },
          S3Configuration: {
            "$ref" : "#/definitions/S3DataSourceConfiguration"
          },
          ConfluenceConfiguration: {
            "$ref" : "#/definitions/ConfluenceDataSourceConfiguration"
          },
          SalesforceConfiguration: {
            "$ref" : "#/definitions/SalesforceDataSourceConfiguration"
          },
          SharePointConfiguration: {
            "$ref" : "#/definitions/SharePointDataSourceConfiguration"
          },
          WebConfiguration: {
            "$ref" : "#/definitions/WebDataSourceConfiguration"
          }
        },
        required: ['Type'],
        additionalProperties: false,
      },
      reason,
    )(lens);
    replaceDefinition(
      'S3DataSourceConfiguration',
      {
        type: 'object',
        description: 'The configuration information to connect to Amazon S3 as your data source.',
        properties: {
          BucketArn: {
            type: 'string',
            maxLength: 2048,
            minLength: 1,
            pattern: "^arn:aws(|-cn|-us-gov):s3:::[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$",
            description: "The ARN of the bucket that contains the data source."
          },
          InclusionPrefixes: {
            type: "array",
            items: {
              type: "string",
              maxLength: 300,
              minLength: 1,
              description: "Prefix for s3 object."
            },
            maxItems: 1,
            minItems: 1,
            description: "A list of S3 prefixes that define the object containing the data sources.",
            insertionOrder: false
          },
          BucketOwnerAccountId: {
            type: "string",
            maxLength: 12,
            minLength: 12,
            pattern: "^[0-9]{12}$",
            description: "The account ID for the owner of the S3 bucket."
          }
        },
        required: ['BucketArn'],
        additionalProperties: false
      },
      reason
    )
  }),
);
