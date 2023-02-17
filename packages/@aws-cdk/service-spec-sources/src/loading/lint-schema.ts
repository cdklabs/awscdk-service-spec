import { Report } from "./schema";

export function lintSchema(schema: any): any {
  let report: Report[] = [];
  report = report.concat(removePatternFromBoolean(schema));
  report = report.concat(replaceMinMaxLength(schema));
  canonicalizeOneOf(schema);
  report = report.concat(removeAdditionalPropertiesOnNonObjects(schema));
  if (report.length > 0) {
    console.log(report);
  }
  return schema;
}

function canonicalizeOneOf(schema: any): void {
  recurseThroughJson(schema, (k, v) => {
    if (v && v.oneOf !== undefined) {
      // copy shared properties
      const sharedProps = JSON.parse(JSON.stringify(v));
      delete sharedProps.oneOf;

      // add combined props into each entry in oneOf
      const combinedOneOfProp = [];
      for (const prop of v.oneOf) {
        combinedOneOfProp.push({
          ...sharedProps,
          ...prop,
        });
      }
      // delete shared props from outside oneOf
      for (const prop of Object.keys(sharedProps)) {
        delete v[prop];
      }
      v.oneOf = combinedOneOfProp;
    }
    return [k, v];
  });
}

function removeAdditionalPropertiesOnNonObjects(schema: any): Report[] {
  const report: Report[] = [];
  recurseThroughJson(schema, (k, v) => {
    if (v && typeof v.type === 'string' && v.type !== 'object' && v.additionalProperties !== undefined) {
      report.push({
        name: `additionaProperties exists on ${v.type}`,
        message: 'additionalProperties should only exist on objects',
        data: JSON.stringify(v),
      });
      delete v.additionalProperties;
    }
    return [k, v];
  });
  return report;
}

function replaceMinMaxLength(schema: any): Report[] {
  const report: Report[] = [];
  recurseThroughJson(schema, (k, v) => {
    if (v && v.type === 'array') {
      if (v.minLength) {
        report.push({
          name: 'minLength exists on array prop',
          message: 'you meant to write minItems',
          data: JSON.stringify(v),
        });
        v.minItems = v.minLength;
        delete v.minLength;
      }
      if (v.maxLength) {
        report.push({
          name: 'maxLength exists on array prop',
          message: 'you meant to write maxItems',
          data: JSON.stringify(v),
        });
        v.maxItems = v.maxLength;
        delete v.maxLength;
      }
    }
    return [k, v];
  });
  return report;
}

function removePatternFromBoolean(schema: any): Report[] {
  const report: Report[] = [];
  recurseThroughJson(schema, (k, v) => {
    if (v && v.type === 'boolean' && v.pattern !== undefined) {
      report.push({
        name: 'remove pattern from boolean',
        message: 'pattern prop does not exist on booleans',
        data: JSON.stringify(v),
      });
      delete v.pattern;
    }
    return [k, v];
  });
  return report;
}

function recurseThroughJson(json: any, cb: (k: any, v: any) => any): any {
  if (typeof json !== 'object' || json == null) {
    return json;
  }

  if (Array.isArray(json)) {
    return json.map(j => recurseThroughJson(j, cb)) as any;
  }

  const result: any = {};
  for (let [k, v] of Object.entries(json)) {
    [k, v] = cb(k, v);
    v = recurseThroughJson(v, cb);
    result[k] = v;
  }
  return result;
}