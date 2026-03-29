import axios, {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import https from "https";
import { createLogger } from "./logger.js";

interface ExtendedAxiosRequestConfig extends InternalAxiosRequestConfig {
  metadata?: {
    startTime: number;
  };
}

const logger = createLogger("AxiosClient");

function getConfig() {
  const proxmoxUrl = process.env["PROXMOX_URL"];
  const apiToken = process.env["PROXMOX_API_TOKEN"];
  const ticketCookie = process.env["PROXMOX_TICKET"];
  const csrfToken = process.env["PROXMOX_CSRF_TOKEN"];
  const insecure = process.env["PROXMOX_INSECURE"] === "true";

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
    timeout: parseInt(process.env["PROXMOX_TIMEOUT"] ?? "30000", 10),
  };
}

function buildHeaders(cfg: ReturnType<typeof getConfig>): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (cfg.apiToken) {
    // API token auth: Authorization: PVEAPIToken=user@realm!tokenid=secret
    headers["Authorization"] = `PVEAPIToken=${cfg.apiToken}`;
  } else if (cfg.ticketCookie) {
    // Ticket-based auth
    headers["Cookie"] = `PVEAuthCookie=${cfg.ticketCookie}`;
    if (cfg.csrfToken) {
      headers["CSRFPreventionToken"] = cfg.csrfToken;
    }
  }

  return headers;
}

let clientInstance: AxiosInstance | null = null;

export function getApiClient(): AxiosInstance {
  if (clientInstance) return clientInstance;

  const cfg = getConfig();
  const headers = buildHeaders(cfg);

  clientInstance = axios.create({
    baseURL: cfg.proxmoxUrl,
    timeout: cfg.timeout,
    headers,
    // Proxmox uses self-signed certs in many deployments
    httpsAgent: cfg.insecure
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined,
  });

  clientInstance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      (config as ExtendedAxiosRequestConfig).metadata = { startTime: Date.now() };
      logger.debug("Making API request", {
        method: config.method?.toUpperCase(),
        url: config.url,
      });
      return config;
    },
    (error: AxiosError) => {
      logger.error("Request interceptor error", { error: error.message });
      return Promise.reject(error);
    }
  );

  clientInstance.interceptors.response.use(
    (response: AxiosResponse) => {
      const metadata = (response.config as ExtendedAxiosRequestConfig).metadata;
      if (metadata?.startTime) {
        const duration = Date.now() - metadata.startTime;
        logger.info("API request completed", {
          method: response.config.method?.toUpperCase(),
          url: response.config.url,
          status: response.status,
          duration: `${duration}ms`,
        });
      }
      return response;
    },
    (error: AxiosError) => {
      if (error.response) {
        logger.error("API error response", {
          status: error.response.status,
          url: error.config?.url,
          method: error.config?.method?.toUpperCase(),
        });
      } else if (error.request) {
        logger.error("No response received", { url: error.config?.url });
      } else {
        logger.error("Request setup error", { error: error.message });
      }
      return Promise.reject(error);
    }
  );

  return clientInstance;
}
