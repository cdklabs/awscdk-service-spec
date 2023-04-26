/**
 * Patches we apply to the service data, in order to:
 *
 * - Fix backwards compatibility.
 * - Enable early access to new features.
 * - Fix any other irregularities.
 *
 * Add new patches in new source files (or combine them into one file if it
 * makes sense) and import them here for their side effects.
 */

export { SERVICE_PATCHERS as EXCEPTIONS_PATCHERS } from './core';

// Convert typed -> Json for some legacy types
import './legacy-untyped';

// Services
import './autoscaling';
import './codebuild';
import './cognito';
import './elasticsearch';
import './iot1click';
import './opensearch';
import './rds';
import './wafv2';
