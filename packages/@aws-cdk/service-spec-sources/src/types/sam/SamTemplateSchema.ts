import { jsonschema } from '../registry-schema/JsonSchema';

/**
 * The SAM schema is just JSON schema with no frills
 */
export type SamTemplateSchema = jsonschema.SchemaFile;
