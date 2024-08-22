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
  }),
);
