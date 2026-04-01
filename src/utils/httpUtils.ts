import { detectMethod as specDetectMethod } from "./openApiSpec.js";

export { specDetectMethod as detectMethod };

export function buildUrl(
  pathTemplate: string,
  pathParams?: Record<string, unknown>
): string {
  if (!pathParams) return pathTemplate;
  return pathTemplate.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const val = pathParams[key];
    if (val === undefined || val === null) {
      throw new Error(`Missing path parameter: ${key}`);
    }
    return String(val);
  });
}
