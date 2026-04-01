import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getApiConfig, getSshConfig } from "./config.js";

describe("config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getApiConfig", () => {
    it("should throw if PROXMOX_URL is not set", () => {
      process.env = {
        PROXMOX_API_TOKEN: "test-token",
      };
      expect(() => getApiConfig()).toThrow("Environment variable PROXMOX_URL is not defined");
    });

    it("should throw if neither PROXMOX_API_TOKEN nor PROXMOX_TICKET is set", () => {
      process.env = {
        PROXMOX_URL: "https://localhost:8006/api2/json",
      };
      expect(() => getApiConfig()).toThrow(
        "Either PROXMOX_API_TOKEN or PROXMOX_TICKET must be defined"
      );
    });

    it("should return config with API token", () => {
      process.env = {
        PROXMOX_URL: "https://localhost:8006/api2/json",
        PROXMOX_API_TOKEN: "root@pam!token=secret",
      };
      const config = getApiConfig();
      expect(config.proxmoxUrl).toBe("https://localhost:8006/api2/json");
      expect(config.apiToken).toBe("root@pam!token=secret");
      expect(config.insecure).toBe(false);
      expect(config.timeout).toBe(30000);
    });

    it("should return config with ticket auth", () => {
      process.env = {
        PROXMOX_URL: "https://localhost:8006/api2/json",
        PROXMOX_TICKET: "ticket123",
        PROXMOX_CSRF_TOKEN: "csrf123",
      };
      const config = getApiConfig();
      expect(config.ticketCookie).toBe("ticket123");
      expect(config.csrfToken).toBe("csrf123");
    });

    it("should parse PROXMOX_INSECURE=true", () => {
      process.env = {
        PROXMOX_URL: "https://localhost:8006/api2/json",
        PROXMOX_API_TOKEN: "test-token",
        PROXMOX_INSECURE: "true",
      };
      const config = getApiConfig();
      expect(config.insecure).toBe(true);
    });

    it("should parse PROXMOX_TIMEOUT", () => {
      process.env = {
        PROXMOX_URL: "https://localhost:8006/api2/json",
        PROXMOX_API_TOKEN: "test-token",
        PROXMOX_TIMEOUT: "60000",
      };
      const config = getApiConfig();
      expect(config.timeout).toBe(60000);
    });
  });

  describe("getSshConfig", () => {
    it("should return default SSH config", () => {
      const config = getSshConfig();
      expect(config.user).toBe("root");
      expect(config.port).toBe(22);
      expect(config.keyPath).toContain(".ssh/proxmox_mcp");
    });

    it("should parse PROXMOX_SSH_USER", () => {
      process.env.PROXMOX_SSH_USER = "admin";
      const config = getSshConfig();
      expect(config.user).toBe("admin");
    });

    it("should parse PROXMOX_SSH_PORT", () => {
      process.env.PROXMOX_SSH_PORT = "2222";
      const config = getSshConfig();
      expect(config.port).toBe(2222);
    });

    it("should parse PROXMOX_SSH_KEY_PATH", () => {
      process.env.PROXMOX_SSH_KEY_PATH = "/custom/path/key";
      const config = getSshConfig();
      expect(config.keyPath).toBe("/custom/path/key");
    });
  });
});
