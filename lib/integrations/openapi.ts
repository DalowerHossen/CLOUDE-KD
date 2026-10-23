// path: lib/integrations/openapi.ts
// Builds the OpenAPI 3.1 document of the public API from the endpoint registry. The JSON schemas come from the same Zod schemas
// that validate the requests, through a small converter for the kinds of schema the API uses.
import { z } from 'zod';
import { API_VERSION } from '@/config/s16-api';
import { ALL_SCOPES } from './api-key-rules';
import type { EndpointSpec } from './public-registry';

type Json = Record<string, unknown>;

/** A JSON schema for the Zod schemas of the API (objects, strings, numbers, booleans, enums, arrays, literals and wrappers). */
export function toJsonSchema(schema: z.ZodTypeAny): Json {
  if (schema instanceof z.ZodEffects) return toJsonSchema(schema._def.schema as z.ZodTypeAny);
  if (schema instanceof z.ZodOptional) return toJsonSchema(schema._def.innerType as z.ZodTypeAny);
  if (schema instanceof z.ZodDefault) {
    const inner = toJsonSchema(schema._def.innerType as z.ZodTypeAny);
    return { ...inner, default: (schema._def.defaultValue as () => unknown)() };
  }
  if (schema instanceof z.ZodNullable) {
    const inner = toJsonSchema(schema._def.innerType as z.ZodTypeAny);
    const type = inner.type;
    return typeof type === 'string'
      ? { ...inner, type: [type, 'null'] }
      : { anyOf: [inner, { type: 'null' }] };
  }
  if (schema instanceof z.ZodString) {
    const out: Json = { type: 'string' };
    for (const c of schema._def.checks) {
      if (c.kind === 'min') out.minLength = c.value;
      else if (c.kind === 'max') out.maxLength = c.value;
      else if (c.kind === 'uuid') out.format = 'uuid';
      else if (c.kind === 'email') out.format = 'email';
      else if (c.kind === 'datetime') out.format = 'date-time';
      else if (c.kind === 'regex') out.pattern = c.regex.source;
    }
    return out;
  }
  if (schema instanceof z.ZodNumber) {
    const out: Json = { type: 'number' };
    for (const c of schema._def.checks) {
      if (c.kind === 'int') out.type = 'integer';
      else if (c.kind === 'min') out.minimum = c.value;
      else if (c.kind === 'max') out.maximum = c.value;
    }
    return out;
  }
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodLiteral) return { const: schema._def.value as unknown };
  if (schema instanceof z.ZodEnum) return { type: 'string', enum: schema._def.values as string[] };
  if (schema instanceof z.ZodArray) {
    const out: Json = { type: 'array', items: toJsonSchema(schema._def.type as z.ZodTypeAny) };
    if (schema._def.minLength) out.minItems = schema._def.minLength.value;
    if (schema._def.maxLength) out.maxItems = schema._def.maxLength.value;
    return out;
  }
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Json = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = toJsonSchema(value);
      if (!value.isOptional() && !(value instanceof z.ZodDefault)) required.push(key);
    }
    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
      additionalProperties: false,
    };
  }
  throw new Error('This kind of Zod schema is not described in the OpenAPI document.');
}

const errorSchema: Json = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message', 'correlation_id'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: {},
        correlation_id: { type: 'string' },
      },
    },
  },
};

const rateHeaders: Json = {
  'X-RateLimit-Limit': {
    description: 'Requests allowed per minute for this key.',
    schema: { type: 'integer' },
  },
  'X-RateLimit-Remaining': {
    description: 'Requests left in the current minute.',
    schema: { type: 'integer' },
  },
  'X-RateLimit-Reset': {
    description: 'Time (seconds since 1970) when the minute ends.',
    schema: { type: 'integer' },
  },
};

function parameters(spec: EndpointSpec): Json[] {
  const out: Json[] = [];
  if (spec.params) {
    for (const [key, value] of Object.entries(spec.params.shape as Record<string, z.ZodTypeAny>))
      out.push({ name: key, in: 'path', required: true, schema: toJsonSchema(value) });
  }
  if (spec.query) {
    for (const [key, value] of Object.entries(spec.query.shape as Record<string, z.ZodTypeAny>))
      out.push({
        name: key,
        in: 'query',
        required: !value.isOptional() && !(value instanceof z.ZodDefault),
        schema: toJsonSchema(value),
      });
  }
  if (spec.idempotent) {
    out.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      description:
        'A unique key (8 to 128 characters). A repeated call with the same key and body returns the first answer.',
      schema: { type: 'string', minLength: 8, maxLength: 128 },
    });
  }
  return out;
}

export function buildOpenApi(endpoints: readonly EndpointSpec[]): Json {
  const schemas: Json = { Error: errorSchema };
  const paths: Record<string, Record<string, Json>> = {};
  for (const e of endpoints) {
    schemas[e.responseName] = toJsonSchema(e.response);
    if (e.body && e.bodyName) schemas[e.bodyName] = toJsonSchema(e.body);
    const ref = { $ref: `#/components/schemas/${e.responseName}` };
    const meta: Json = {
      type: 'object',
      required: ['correlation_id', 'version'],
      properties: {
        correlation_id: { type: 'string' },
        version: { type: 'string' },
        ...(e.list ? { next_cursor: { type: ['string', 'null'] } } : {}),
      },
    };
    const success = e.method === 'post' && e.createsRecord ? '201' : '200';
    const operation: Json = {
      operationId: e.operationId,
      summary: e.summary,
      tags: [e.tag],
      ...(e.scope
        ? { security: [{ bearerAuth: [] }], 'x-required-scope': e.scope }
        : { security: [] }),
      parameters: parameters(e),
      ...(e.body && e.bodyName
        ? {
            requestBody: {
              required: true,
              content: {
                'application/json': { schema: { $ref: `#/components/schemas/${e.bodyName}` } },
              },
            },
          }
        : {}),
      responses: {
        [success]: {
          description: 'Success.',
          headers: e.scope ? rateHeaders : {},
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['data', 'meta'],
                properties: { data: e.list ? { type: 'array', items: ref } : ref, meta },
              },
            },
          },
        },
        ...Object.fromEntries(
          (e.scope ? ['400', '401', '403', '404', '429'] : ['400', '429']).map((code) => [
            code,
            {
              description:
                {
                  '400': 'The request is not valid.',
                  '401': 'The API key is missing or not valid.',
                  '403': 'The key does not have the needed scope.',
                  '404': 'The item was not found.',
                  '429': 'The key is over its limit. See Retry-After.',
                }[code] ?? 'Error.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            },
          ]),
        ),
      },
    };
    const entry = paths[e.path] ?? {};
    entry[e.method] = operation;
    paths[e.path] = entry;
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'KD SOLUTION IT public API',
      version: API_VERSION,
      description:
        'Authenticate with an API key: `Authorization: Bearer <key>`. All money is USD, written as text with up to four decimals. Lists use cursor pagination (`limit`, `cursor`, and `next_cursor` in `meta`). A key with a sandbox mode (`kd_test_` prefix) works on separate test data.',
    },
    servers: [{ url: '/api/public/v1' }],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
      schemas,
    },
    'x-scopes': ALL_SCOPES,
    paths,
  };
}
