import { describe, it, expect } from "vitest";
import { buildUrl } from "./httpUtils.js";

describe("httpUtils", () => {
  describe("buildUrl", () => {
    it("should return path unchanged if no pathParams provided", () => {
      const url = "/nodes/pve/qemu/100/status/current";
      expect(buildUrl(url)).toBe(url);
    });

    it("should return path unchanged if pathParams is empty object", () => {
      const url = "/nodes/pve/qemu/100/status/current";
      expect(buildUrl(url, {})).toBe(url);
    });

    it("should substitute single path parameter", () => {
      const url = "/nodes/{node}/qemu/{vmid}/status/current";
      const params = { node: "pve1", vmid: 100 };
      expect(buildUrl(url, params)).toBe("/nodes/pve1/qemu/100/status/current");
    });

    it("should substitute string path parameters", () => {
      const url = "/nodes/{node}/storage/{storage}";
      const params = { node: "pve", storage: "local" };
      expect(buildUrl(url, params)).toBe("/nodes/pve/storage/local");
    });

    it("should substitute numeric path parameters", () => {
      const url = "/access/users/{userid}/token";
      const params = { userid: 123 };
      expect(buildUrl(url, params)).toBe("/access/users/123/token");
    });

    it("should throw if path parameter is missing", () => {
      const url = "/nodes/{node}/qemu/{vmid}/status/current";
      const params = { node: "pve" };
      expect(() => buildUrl(url, params)).toThrow("Missing path parameter: vmid");
    });

    it("should throw if path parameter is null", () => {
      const url = "/nodes/{node}/qemu/{vmid}";
      const params = { node: "pve", vmid: null };
      expect(() => buildUrl(url, params)).toThrow("Missing path parameter: vmid");
    });

    it("should throw if path parameter is undefined", () => {
      const url = "/nodes/{node}/qemu/{vmid}";
      const params = { node: "pve", vmid: undefined };
      expect(() => buildUrl(url, params)).toThrow("Missing path parameter: vmid");
    });

    it("should handle partial parameter replacement", () => {
      const url = "/nodes/{node}/qemu";
      const params = { node: "pve" };
      expect(buildUrl(url, params)).toBe("/nodes/pve/qemu");
    });

    it("should handle parameters with hyphens", () => {
      const url = "/nodes/{node}/firewall/rules/{ruleid}";
      const params = { node: "pve", ruleid: "100" };
      expect(buildUrl(url, params)).toBe("/nodes/pve/firewall/rules/100");
    });

    it("should handle URL with query string preserved", () => {
      const url = "/nodes/{node}/qemu/{vmid}/status/current";
      const params = { node: "pve", vmid: 100 };
      expect(buildUrl(url, params)).toBe("/nodes/pve/qemu/100/status/current");
    });
  });
});
