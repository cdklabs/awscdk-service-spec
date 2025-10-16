export interface OobRelationshipData {
  [resourceType: string]: {
    relationships?: Record<
      string,
      Array<{
        cloudformationType: string;
        propertyPath: string;
      }>
    >;
  };
}
