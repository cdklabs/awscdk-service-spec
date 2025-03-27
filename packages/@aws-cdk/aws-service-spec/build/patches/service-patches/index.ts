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

// Services
import './autoscaling';
import './batch';
import './bedrock';
import './cloudformation';
import './codebuild';
import './cognito';
import './config';
import './dms';
import './elasticsearch';
import './iot1click';
import './opensearch';
import './rds';
import './resiliencehub';
import './s3';
import './sagemaker';
import './wafv2';
import './securitylake';
import './iotfleetwise';
