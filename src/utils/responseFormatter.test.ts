import { describe, it, expect } from "vitest";
import { ResponseFormatter } from "./responseFormatter.js";

describe("responseFormatter", () => {
  describe("success", () => {
    it("should create a success response with message only", () => {
      const result = ResponseFormatter.success("Operation completed");
      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe("text");
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.success).toBe(true);
      expect(parsed.message).toBe("Operation completed");
      expect(parsed.data).toBeUndefined();
      expect(result.isError).toBeUndefined();
    });

    it("should create a success response with data", () => {
      const data = { id: 1, name: "test" };
      const result = ResponseFormatter.success("Fetched item", data);
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.success).toBe(true);
      expect(parsed.message).toBe("Fetched item");
      expect(parsed.data).toEqual(data);
    });

    it("should handle null data", () => {
      const result = ResponseFormatter.success("Done", null);
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toBeUndefined();
    });

    it("should handle undefined data", () => {
      const result = ResponseFormatter.success("Done", undefined);
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toBeUndefined();
    });

    it("should handle array data", () => {
      const data = [1, 2, 3];
      const result = ResponseFormatter.success("Got list", data);
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.data).toEqual(data);
    });
  });

  describe("error", () => {
    it("should create an error response with message only", () => {
      const result = ResponseFormatter.error("Something went wrong");
      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe("text");
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("Something went wrong");
      expect(parsed.details).toBeUndefined();
      expect(result.isError).toBe(true);
    });

    it("should create an error response with details", () => {
      const result = ResponseFormatter.error("Validation failed", "Field 'name' is required");
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("Validation failed");
      expect(parsed.details).toBe("Field 'name' is required");
    });

    it("should handle empty string details", () => {
      const result = ResponseFormatter.error("Error", "");
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.details).toBeUndefined();
    });

    it("should handle undefined details", () => {
      const result = ResponseFormatter.error("Error");
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.details).toBeUndefined();
    });
  });
});
