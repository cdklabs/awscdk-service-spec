import { ImplicitJsonSchemaRecord } from '../registry-schema/CloudFormationRegistrySchema';

export interface EventBridgeSchema extends ImplicitJsonSchemaRecord {
  readonly SchemaName: string;
  readonly Description: string;
  readonly Content: {
    components: {
      schemas: {
        AWSEvent: {
          'x-amazon-events-detail-type': string;
          'x-amazon-events-source': string;
          properties: {
            detail: {
              $ref: string;
            };
          };
        };
      };
    };
  };
}
