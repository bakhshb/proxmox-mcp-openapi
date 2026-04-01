import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import yaml from "js-yaml";
import { createLogger } from "./logger.js";
import { METHOD_PREFERENCE, type HttpMethod } from "./constants.js";

export type { HttpMethod };

const logger = createLogger("OpenApiSpec");

// Resolve spec path relative to this file's location
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// From build/utils/ → ../../reference/spec.v2.yaml
const SPEC_PATH = join(__dirname, "../../reference/spec.v2.yaml");

export interface OpenApiSpec {
  openapi: string;
  info: Record<string, unknown>;
  servers?: Array<{ url: string; description?: string }>;
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: Record<string, unknown>;
  tags?: Array<{ name: string; description?: string }>;
}

export interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: {
    content: Record<string, { schema: Record<string, unknown> }>;
    required?: boolean;
  };
  responses?: Record<string, unknown>;
}

export interface OpenApiParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  description?: string;
  schema?: Record<string, unknown>;
}

let cachedSpec: OpenApiSpec | null = null;

/**
 * Loads and caches the OpenAPI spec from the local YAML file.
 */
export function getOpenApiSpec(): OpenApiSpec {
  if (cachedSpec) return cachedSpec;

  logger.info("Loading OpenAPI spec from local file", { path: SPEC_PATH });
  const content = readFileSync(SPEC_PATH, "utf-8");
  cachedSpec = yaml.load(content) as OpenApiSpec;
  logger.info("OpenAPI spec loaded", {
    paths: Object.keys(cachedSpec.paths).length,
  });
  return cachedSpec;
}

/**
 * Auto-detects the HTTP method for a given path.
 * Preference order: get → post → put → delete → patch
 */
export function detectMethod(path: string): HttpMethod | null {
  const spec = getOpenApiSpec();
  const pathObj = spec.paths[path];
  if (!pathObj) return null;

  for (const method of METHOD_PREFERENCE) {
    if (method in pathObj) return method;
  }
  return null;
}

/**
 * Returns a map of path → preferred HTTP method for all operations.
 */
export function getPathMethodMap(): Map<string, HttpMethod> {
  const spec = getOpenApiSpec();
  const map = new Map<string, HttpMethod>();

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const method of METHOD_PREFERENCE) {
      if (method in methods) {
        map.set(path, method);
        break;
      }
    }
  }
  return map;
}

/**
 * Builds the operations list string grouped by tag for the tool description.
 */
export function getOperationsList(): string {
  const spec = getOpenApiSpec();
  const byTag: Record<string, string[]> = {};

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods) as [HttpMethod, OpenApiOperation][]) {
      const tags = op.tags ?? ["other"];
      const label = `${method.toUpperCase()} ${path}`;
      for (const tag of tags) {
        if (!byTag[tag]) byTag[tag] = [];
        byTag[tag].push(label);
      }
    }
  }

  const lines = Object.entries(byTag)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, ops]) => `[${tag}]: ${ops.sort().join(", ")}`);

  return (
    "Available operations (use proxmox-api-schema for parameter details):\n" +
    lines.join("\n")
  );
}
