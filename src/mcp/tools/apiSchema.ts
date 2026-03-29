import { z } from "zod";
import { createLogger } from "../../utils/logger.js";
import { ResponseFormatter } from "../../utils/responseFormatter.js";
import {
  getOpenApiSpec,
  type OpenApiOperation,
  type HttpMethod,
} from "../../utils/openApiSpec.js";

const logger = createLogger("ProxmoxApiSchema");

const SUPPORTED_METHODS: HttpMethod[] = ["get", "post", "put", "delete", "patch"];

interface OperationDetail {
  path: string;
  method: string;
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  pathParams?: ParameterInfo[];
  queryParams?: ParameterInfo[];
  requestBody?: Record<string, unknown>;
}

interface ParameterInfo {
  name: string;
  required: boolean;
  type?: string;
  description?: string;
}

function resolveRef(
  spec: Record<string, unknown>,
  ref: string,
  depth = 0
): Record<string, unknown> {
  if (depth > 8) return { note: "Max resolution depth reached" };

  const parts = ref.replace(/^#\//, "").split("/");
  let current: unknown = spec;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) return {};
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current !== "object" || current === null) return {};
  return resolveSchema(spec, current as Record<string, unknown>, depth + 1);
}

function resolveSchema(
  spec: Record<string, unknown>,
  schema: Record<string, unknown>,
  depth = 0
): Record<string, unknown> {
  if (depth > 8) return { note: "Max resolution depth reached" };

  if (typeof schema["$ref"] === "string") {
    return resolveRef(spec, schema["$ref"], depth);
  }

  if (Array.isArray(schema["allOf"])) {
    let merged: Record<string, unknown> = {};
    for (const sub of schema["allOf"] as Record<string, unknown>[]) {
      merged = { ...merged, ...resolveSchema(spec, sub, depth + 1) };
    }
    return merged;
  }

  if (Array.isArray(schema["oneOf"]) || Array.isArray(schema["anyOf"])) {
    const variants = (schema["oneOf"] ?? schema["anyOf"]) as Record<string, unknown>[];
    return {
      oneOf: variants.map((v) => resolveSchema(spec, v, depth + 1)),
    };
  }

  if (schema["type"] === "object" && schema["properties"]) {
    const props = schema["properties"] as Record<string, Record<string, unknown>>;
    const required = new Set<string>(
      Array.isArray(schema["required"]) ? (schema["required"] as string[]) : []
    );
    const result: Record<string, unknown> = {};

    for (const [propName, propSchema] of Object.entries(props)) {
      const resolved = resolveSchema(spec, propSchema, depth + 1);
      result[propName] = {
        ...resolved,
        required: required.has(propName),
      };
    }
    return { type: "object", properties: result };
  }

  return schema;
}

function extractOperation(
  spec: ReturnType<typeof getOpenApiSpec>,
  path: string,
  method: HttpMethod,
  op: OpenApiOperation
): OperationDetail {
  const detail: OperationDetail = {
    path,
    method: method.toUpperCase(),
    operationId: op.operationId,
    summary: op.summary,
    description: op.description,
    tags: op.tags,
  };

  // Path and query parameters
  if (op.parameters && op.parameters.length > 0) {
    const pathParams: ParameterInfo[] = [];
    const queryParams: ParameterInfo[] = [];

    for (const param of op.parameters) {
      const info: ParameterInfo = {
        name: param.name,
        required: param.required ?? false,
        type: (param.schema?.["type"] as string) ?? "string",
        description: param.description,
      };
      if (param.in === "path") {
        pathParams.push(info);
      } else if (param.in === "query") {
        queryParams.push(info);
      }
    }

    if (pathParams.length > 0) detail.pathParams = pathParams;
    if (queryParams.length > 0) detail.queryParams = queryParams;
  }

  // Request body schema
  if (op.requestBody) {
    const jsonContent = op.requestBody.content["application/json"];
    if (jsonContent?.schema) {
      detail.requestBody = resolveSchema(
        spec as unknown as Record<string, unknown>,
        jsonContent.schema
      );
    }
  }

  return detail;
}

export const schema = {
  tag: z
    .string()
    .optional()
    .describe(
      'Filter operations by tag, e.g. "nodes", "cluster", "storage", "access"'
    ),
  path: z
    .string()
    .optional()
    .describe(
      'Get details for a specific path, e.g. "/nodes/{node}/qemu/{vmid}/status/current"'
    ),
  method: z
    .enum(["GET", "POST", "PUT", "DELETE", "PATCH"])
    .optional()
    .describe(
      "Filter by HTTP method when combined with path (defaults to listing all methods for that path)"
    ),
};

export const name = "proxmox-api-schema";

export const description =
  "Discover Proxmox VE API operations and their parameters from the OpenAPI spec. Call with no args for a tag summary, with tag to list operations, or with path for full parameter details.";

export const annotations = {
  title: "Proxmox API Schema",
  readOnlyHint: true,
  idempotentHint: true,
};

export async function handler(input: {
  tag?: string;
  path?: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
}) {
  try {
    const spec = getOpenApiSpec();

    // Specific path requested
    if (input.path) {
      const pathObj = spec.paths[input.path];
      if (!pathObj) {
        return ResponseFormatter.error(
          "Path not found",
          `No path "${input.path}" in spec. Use proxmox-api-schema without args to see available tags.`
        );
      }

      const operations: OperationDetail[] = [];
      const methodFilter = input.method?.toLowerCase() as HttpMethod | undefined;

      for (const method of SUPPORTED_METHODS) {
        if (method in pathObj) {
          if (methodFilter && method !== methodFilter) continue;
          const op = pathObj[method] as OpenApiOperation;
          operations.push(extractOperation(spec, input.path, method, op));
        }
      }

      return ResponseFormatter.success(`Schema for ${input.path}`, {
        path: input.path,
        operations,
      });
    }

    // Tag filter — list operations for that tag
    if (input.tag) {
      const operations: Array<{ path: string; method: string; summary?: string; operationId?: string }> = [];

      for (const [path, methods] of Object.entries(spec.paths)) {
        for (const method of SUPPORTED_METHODS) {
          if (!(method in methods)) continue;
          const op = methods[method] as OpenApiOperation;
          if (op.tags && op.tags.includes(input.tag)) {
            operations.push({
              path,
              method: method.toUpperCase(),
              summary: op.summary,
              operationId: op.operationId,
            });
          }
        }
      }

      if (operations.length === 0) {
        return ResponseFormatter.error(
          "Tag not found",
          `No operations with tag "${input.tag}". Use proxmox-api-schema without args to see available tags.`
        );
      }

      return ResponseFormatter.success(`Operations in tag: ${input.tag}`, {
        tag: input.tag,
        count: operations.length,
        operations: operations.sort((a, b) => a.path.localeCompare(b.path)),
      });
    }

    // No filter — return tag summary
    const tagCounts: Record<string, number> = {};
    let totalOperations = 0;

    for (const methods of Object.values(spec.paths)) {
      for (const method of SUPPORTED_METHODS) {
        if (!(method in methods)) continue;
        const op = methods[method] as OpenApiOperation;
        totalOperations++;
        for (const tag of op.tags ?? ["untagged"]) {
          tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
        }
      }
    }

    return ResponseFormatter.success("Available tags", {
      totalPaths: Object.keys(spec.paths).length,
      totalOperations,
      tags: tagCounts,
    });
  } catch (error) {
    logger.error("Failed to read API schema", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return ResponseFormatter.error(
      "Failed to read API schema",
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}
