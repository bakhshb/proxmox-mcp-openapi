export type HttpMethod = "get" | "post" | "put" | "delete" | "patch";

export const SUPPORTED_METHODS: HttpMethod[] = ["get", "post", "put", "delete", "patch"];

export const HTTP_METHODS_UPPER = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;

export const METHOD_PREFERENCE: HttpMethod[] = ["get", "post", "put", "delete", "patch"];
