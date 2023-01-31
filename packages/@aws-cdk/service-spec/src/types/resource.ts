export enum RegionT {};

export type Region = string & RegionT;

export interface Service {
  readonly shortName: string;
  readonly name: string;
}

export interface Resource {
  readonly name: string;
  readonly cloudFormationType: string;
  readonly properties: unknown;
  readonly attributes: unknown;
  readonly regions: Region[];
  readonly validations: unknown;
  readonly identifiers: unknown;
}
