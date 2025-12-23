/**
 * Maps a resource type to a list of properties that are overrides of the CCAPI schema primary identifiers
 */
export interface CfnPrimaryIdentifierOverrides {
  [resourceType: string]: string[];
}
