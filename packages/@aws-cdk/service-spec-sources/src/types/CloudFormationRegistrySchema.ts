import { jsonschema } from "./JsonSchema";

export interface CloudFormationRegistryResource extends ImplicitJsonSchemaObject {
  readonly typeName: string;
  readonly description: string;
  readonly createOnlyProperties?: string[];
  readonly readOnlyProperties?: string[];
  readonly writeOnlyProperties?: string[];
  readonly primaryIdentifier?: string[];
  readonly definitions: Record<string, jsonschema.Schema>;
  readonly handlers?: Record<Operation, Handler>;
  readonly tagging?: ResourceTagging;
}

export type Operation = 'create' | 'read' | 'update' | 'delete' | 'list';

export interface Handler {
  readonly permissions: string[];
}

export type ImplicitJsonSchemaObject = Omit<jsonschema.Object, 'type'>;

export interface ResourceTagging {
  readonly taggable?: boolean;
  readonly tagOnCreate?: boolean;
  readonly tagUpdatable?: boolean;
  readonly cloudFormationSystemTags?: boolean;
  readonly tagProperty?: string;
}
