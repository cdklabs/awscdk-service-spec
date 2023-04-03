import { normalizeJsonSchema } from './json-schema-patches';

/**
 * Patchers that apply to the SAM Template spec file
 */
export const patchSamTemplateSpec = normalizeJsonSchema;
