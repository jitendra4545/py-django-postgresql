import spec from '../../docs/openapi.json';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

export const resolveRef = (node) => {
  if (!node?.$ref) return node;
  return node.$ref
    .replace(/^#\//, '')
    .split('/')
    .reduce((value, part) => value?.[part], spec);
};

const sampleString = (schema, name) => {
  if (schema.format === 'email') return 'test@example.com';
  if (schema.format === 'date-time') return new Date(Date.now() + 86_400_000).toISOString();
  if (schema.format === 'date') return new Date().toISOString().slice(0, 10);
  if (schema.format === 'binary') return '<choose-file>';
  if (/password/i.test(name)) return 'TestPassword@2026';
  if (/token/i.test(name)) return '<token>';
  if (/reason|note|description|message|requestText/i.test(name)) return 'API console test request';
  return schema.example ?? `<${name || 'string'}>`;
};

export const schemaSample = (input, name = '') => {
  const schema = resolveRef(input) ?? {};
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.oneOf?.length) return schemaSample(schema.oneOf[0], name);
  if (schema.type === 'array') return [schemaSample(schema.items, name)];
  if (schema.type === 'object' || schema.properties) {
    return Object.fromEntries(
      Object.entries(schema.properties ?? {})
        .filter(([key]) => schema.required?.includes(key))
        .map(([key, value]) => [key, schemaSample(value, key)]),
    );
  }
  if (schema.type === 'integer' || schema.type === 'number') return schema.minimum ?? 1;
  if (schema.type === 'boolean') return false;
  return sampleString(schema, name);
};

const parameterValue = (parameter) => {
  const schema = resolveRef(parameter.schema) ?? {};
  if (parameter.name === 'startAt') return new Date(Date.now() + 86_400_000).toISOString();
  if (parameter.name === 'endAt') return new Date(Date.now() + 90_000_000).toISOString();
  if (parameter.name === 'serviceCode') return 'CHAUFFEUR';
  if (parameter.name === 'countryCode') return 'CH';
  if (parameter.name === 'city') return 'Geneva';
  if (parameter.name === 'page') return '1';
  if (parameter.name === 'perPage') return '20';
  if (parameter.name === 'Idempotency-Key') return crypto.randomUUID();
  return String(schema.example ?? schema.default ?? schema.minimum ?? '1');
};

export const endpoints = Object.entries(spec.paths).flatMap(([path, pathItem]) =>
  HTTP_METHODS.filter((method) => pathItem[method]).map((method) => {
    const operation = pathItem[method];
    const parameters = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])].map(
      (parameter) => resolveRef(parameter),
    );
    const content = operation.requestBody?.content ?? {};
    const contentType = Object.keys(content)[0] ?? null;
    const bodySchema = contentType ? content[contentType]?.schema : null;
    return {
      key: `${method.toUpperCase()} ${path}`,
      method: method.toUpperCase(),
      path,
      tag: operation.tags?.[0] ?? 'Other',
      summary: operation.summary ?? '',
      description: operation.description ?? '',
      protected: Boolean(operation.security?.length),
      parameters,
      initialParameters: Object.fromEntries(
        parameters.map((parameter) => [parameter.name, parameterValue(parameter)]),
      ),
      contentType,
      bodySample: bodySchema ? schemaSample(bodySchema) : null,
      serverOnly: path === '/payments/webhook',
      developmentOnly: path.endsWith('/mock-confirm'),
    };
  }),
);

export const tags = [...new Set(endpoints.map((endpoint) => endpoint.tag))];
export { spec };
