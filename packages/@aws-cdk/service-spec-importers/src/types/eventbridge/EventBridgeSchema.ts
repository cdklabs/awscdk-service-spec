export interface EventBridgeSchema {
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
