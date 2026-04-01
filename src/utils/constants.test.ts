import { describe, it, expect } from "vitest";
import {
  SUPPORTED_METHODS,
  HTTP_METHODS_UPPER,
  METHOD_PREFERENCE,
} from "./constants.js";

describe("constants", () => {
  describe("SUPPORTED_METHODS", () => {
    it("should contain all expected HTTP methods", () => {
      expect(SUPPORTED_METHODS).toEqual(["get", "post", "put", "delete", "patch"]);
    });

    it("should have 5 supported methods", () => {
      expect(SUPPORTED_METHODS).toHaveLength(5);
    });
  });

  describe("HTTP_METHODS_UPPER", () => {
    it("should contain uppercase HTTP methods", () => {
      expect(HTTP_METHODS_UPPER).toEqual(["GET", "POST", "PUT", "DELETE", "PATCH"]);
    });

    it("should have same length as SUPPORTED_METHODS", () => {
      expect(HTTP_METHODS_UPPER).toHaveLength(SUPPORTED_METHODS.length);
    });
  });

  describe("METHOD_PREFERENCE", () => {
    it("should prefer GET before POST", () => {
      const getIndex = METHOD_PREFERENCE.indexOf("get");
      const postIndex = METHOD_PREFERENCE.indexOf("post");
      expect(getIndex).toBeLessThan(postIndex);
    });

    it("should contain all supported methods", () => {
      for (const method of SUPPORTED_METHODS) {
        expect(METHOD_PREFERENCE).toContain(method);
      }
    });
  });
});
