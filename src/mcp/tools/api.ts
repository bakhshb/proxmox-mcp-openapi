import { z } from "zod";
import { AxiosError } from "axios";
import { getApiClient } from "../../utils/apiClient.js";
import { createLogger } from "../../utils/logger.js";
import { ResponseFormatter } from "../../utils/responseFormatter.js";
import { detectMethod, buildUrl } from "../../utils/httpUtils.js";
import type { HttpMethod } from "../../utils/constants.js";

const logger = createLogger("ProxmoxApi");

export const schema = {
  path: z
    .string()
    .min(1)
    .describe(
      'The API path as defined in the OpenAPI spec, e.g. "/nodes/{node}/qemu/{vmid}/status/current". Use proxmox-api-schema to discover available paths.'
    ),
  method: z
    .enum(["GET", "POST", "PUT", "DELETE", "PATCH"])
    .optional()
    .describe(
      "HTTP method. If omitted, auto-detected from the OpenAPI spec (prefers GET when available)."
    ),
  pathParams: z
    .record(z.union([z.string(), z.number()]))
    .optional()
    .describe(
      'Path parameter values to substitute into the URL, e.g. { "node": "pve", "vmid": 100 }'
    ),
  params: z
    .record(z.unknown())
    .optional()
    .describe(
      "For GET/DELETE: query string parameters. For POST/PUT/PATCH: JSON request body."
    ),
};

export const name = "proxmox-api";

export const description =
  "Execute any Proxmox VE API operation. Specify the path from the OpenAPI spec (e.g. /nodes/{node}/qemu) and optional path params, query params, or body. HTTP method is auto-detected from the spec. Use proxmox-api-schema to discover paths and parameters.";

export const annotations = {
  title: "Proxmox API",
  readOnlyHint: false,
  openWorldHint: true,
};

export async function handler(input: {
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  pathParams?: Record<string, string | number>;
  params?: Record<string, unknown>;
}) {
  const { path, pathParams, params } = input;

  // Resolve HTTP method
  const methodRaw: HttpMethod = input.method
    ? (input.method.toLowerCase() as HttpMethod)
    : (detectMethod(path) ?? "get");

  // Build the actual URL with path params substituted
  let url: string;
  try {
    url = buildUrl(path, pathParams);
  } catch (err) {
    return ResponseFormatter.error(
      "Invalid path parameters",
      err instanceof Error ? err.message : "Unknown error"
    );
  }

  logger.info(`Executing ${methodRaw.toUpperCase()} ${url}`, {
    hasParams: !!params,
  });

  try {
    const client = getApiClient();
    let responseData: unknown;

    if (methodRaw === "get" || methodRaw === "delete") {
      const response = await client[methodRaw](url, { params });
      responseData = response.data;
    } else {
      // post, put, patch — body
      const response = await client[methodRaw](url, params ?? {});
      responseData = response.data;
    }

    return ResponseFormatter.success(
      `${methodRaw.toUpperCase()} ${url} succeeded`,
      responseData
    );
  } catch (error) {
    logger.error(`${methodRaw.toUpperCase()} ${url} failed`, {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    if (error instanceof AxiosError && error.response) {
      const status = error.response.status;
      const data = error.response.data as Record<string, unknown> | undefined;
      const detail =
        (data?.errors as string) ||
        (data?.message as string) ||
        error.message;

      if (status === 400) {
        return ResponseFormatter.error(`Bad request: ${url}`, detail);
      }
      if (status === 401) {
        return ResponseFormatter.error(
          "Authentication failed",
          "Check PROXMOX_API_TOKEN or ticket configuration"
        );
      }
      if (status === 403) {
        return ResponseFormatter.error(
          "Access denied",
          `Insufficient permissions for ${url}`
        );
      }
      if (status === 404) {
        return ResponseFormatter.error(
          "Resource not found",
          `Path ${url} not found or resource does not exist`
        );
      }
      if (status === 500) {
        return ResponseFormatter.error(
          "Proxmox server error",
          `Internal error while processing ${url}`
        );
      }
      return ResponseFormatter.error(`HTTP ${status}: ${url}`, detail);
    }

    return ResponseFormatter.error(
      `Failed: ${url}`,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}
