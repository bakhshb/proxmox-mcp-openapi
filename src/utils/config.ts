import os from "os";
import path from "path";

export interface ApiConfig {
  proxmoxUrl: string;
  apiToken: string | undefined;
  ticketCookie: string | undefined;
  csrfToken: string | undefined;
  insecure: boolean;
  timeout: number;
}

export interface SshConfig {
  keyPath: string;
  user: string;
  port: number;
}

export function getApiConfig(): ApiConfig {
  const proxmoxUrl = process.env["PROXMOX_URL"];
  const apiToken = process.env["PROXMOX_API_TOKEN"];
  const ticketCookie = process.env["PROXMOX_TICKET"];
  const csrfToken = process.env["PROXMOX_CSRF_TOKEN"];
  const insecure = process.env["PROXMOX_INSECURE"] === "true";
  const timeout = parseInt(process.env["PROXMOX_TIMEOUT"] ?? "30000", 10);

  if (!proxmoxUrl) {
    throw new Error("Environment variable PROXMOX_URL is not defined");
  }

  if (!apiToken && !ticketCookie) {
    throw new Error(
      "Either PROXMOX_API_TOKEN or PROXMOX_TICKET must be defined"
    );
  }

  return {
    proxmoxUrl,
    apiToken,
    ticketCookie,
    csrfToken,
    insecure,
    timeout,
  };
}

export function getSshConfig(): SshConfig {
  return {
    keyPath: process.env["PROXMOX_SSH_KEY_PATH"] || path.join(os.homedir(), ".ssh", "proxmox_mcp"),
    user: process.env["PROXMOX_SSH_USER"] || "root",
    port: parseInt(process.env["PROXMOX_SSH_PORT"] ?? "22", 10),
  };
}
