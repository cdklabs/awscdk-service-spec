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
);
