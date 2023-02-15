export function lintSchema(schema: any): any {
  schema = redundantPatternInBooleanProp(schema);
  schema = replaceMinMaxLength(schema);
  return schema;
}

function replaceMinMaxLength(schema: any): any {
  return recurseThroughJson(schema, (k, v) => {
    if (v && v.type === 'array') {
      if (v.minLength) {
        v.minItems = v.minLength;
        delete v.minLength;
      }
      if (v.maxLength) {
        v.maxItems = v.maxLength;
        delete v.maxLength;
      }
    }
    return [k, v];
  });
}

function redundantPatternInBooleanProp(schema: any): any {
  return recurseThroughJson(schema, (k, v) => {
    if (v && v.type === 'boolean' && v.pattern !== undefined) {
      delete v.pattern;
    }
    return [k, v];
  });
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