import { z } from "zod";
import { AxiosError } from "axios";
import { getApiClient } from "../../utils/apiClient.js";
import { createLogger } from "../../utils/logger.js";
import { ResponseFormatter } from "../../utils/responseFormatter.js";

const logger = createLogger("ExecuteVmCommand");

export const schema = {
  node: z
    .string()
    .min(1)
    .default("pve")
    .describe("Proxmox node name (e.g. 'pve', 'pve1')"),
  vmid: z
    .number()
    .int()
    .positive()
    .describe("VM ID (e.g. 100, 101)"),
  command: z
    .string()
    .min(1)
    .describe(
      "Command to run inside the VM via QEMU guest agent. Note: shell features like pipes (|) and redirects (2>&1) are NOT supported — pass a single executable with arguments only. For complex commands, use proxmox-api directly with manual exec/exec-status calls."
    ),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .default(30000)
    .optional()
    .describe("Maximum time to wait for command completion in milliseconds (default: 30000)"),
};

export const name = "proxmox-execute-vm-command";

export const description =
  "Execute a command inside a running VM via QEMU guest agent. The VM must have the QEMU guest agent installed and running. Note: shell features like pipes and redirects are NOT supported — pass a single executable with arguments. Uses the Proxmox API (PROXMOX_URL, PROXMOX_API_TOKEN) for communication.";

export const annotations = {
  title: "Execute VM Command",
  readOnlyHint: false,
  openWorldHint: false,
};

interface ExecStatusResponse {
  exited?: number;
  exitcode?: number;
  "out-data"?: string;
  "err-data"?: string;
  "out-truncated"?: number;
  "err-truncated"?: number;
  signal?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handler(input: {
  node: string;
  vmid: number;
  command: string;
  timeoutMs?: number;
}) {
  const { node, vmid, command, timeoutMs = 30000 } = input;

  logger.info(`execute_vm_command: node=${node}, vmid=${vmid}, command=${command}`);

  const client = getApiClient();

  // Step 1: Check VM exists and is running
  try {
    const statusRes = await client.get(`/nodes/${node}/qemu/${vmid}/status/current`);
    const vmStatus = statusRes.data?.data?.status;
    if (vmStatus !== "running") {
      return ResponseFormatter.error(
        "VM is not running",
        `VM ${vmid} on node '${node}' is in state '${vmStatus ?? "unknown"}'. The VM must be running with QEMU guest agent active.`
      );
    }
  } catch (err) {
    const axiosErr = err as AxiosError;
    if (axiosErr.response?.status === 404 || axiosErr.response?.status === 500) {
      return ResponseFormatter.error(
        "VM not found",
        `VM ${vmid} was not found on node '${node}'. Check that the node and VMID are correct.`
      );
    }
    const msg = axiosErr.message ?? "Unknown error";
    return ResponseFormatter.error("Failed to check VM status", msg);
  }

  // Step 2: POST to agent/exec to start the command
  let pid: number;
  try {
    const execRes = await client.post(`/nodes/${node}/qemu/${vmid}/agent/exec`, {
      command,
    });
    pid = execRes.data?.data?.pid;
    if (!pid) {
      return ResponseFormatter.error(
        "No PID returned",
        `The QEMU agent exec returned no PID for command '${command}'. Response: ${JSON.stringify(execRes.data)}`
      );
    }
    logger.info(`Command started with PID ${pid}`);
  } catch (err) {
    const axiosErr = err as AxiosError;
    const status = axiosErr.response?.status;
    if (status === 596 || status === 500) {
      return ResponseFormatter.error(
        "QEMU agent exec failed",
        `The QEMU guest agent rejected the command. This can happen with shell features (pipes, redirects). ` +
          `Use a single executable with arguments only, or use proxmox-api directly for complex commands. ` +
          `HTTP ${status}: ${axiosErr.message}`
      );
    }
    if (status === 404) {
      return ResponseFormatter.error(
        "QEMU guest agent not available",
        `QEMU guest agent is not installed or not running in VM ${vmid}. ` +
          `Install qemu-guest-agent in the VM and ensure it is started.`
      );
    }
    return ResponseFormatter.error(
      "Failed to execute command via QEMU agent",
      axiosErr.message ?? "Unknown error"
    );
  }

  // Step 3: Poll exec-status with exponential backoff
  const deadline = Date.now() + timeoutMs;
  const backoffMs = [100, 200, 400, 800, 1600];
  let partialOutput = "";
  let pollAttempt = 0;

  while (Date.now() < deadline) {
    const delay = backoffMs[Math.min(pollAttempt, backoffMs.length - 1)] ?? 1600;
    await sleep(delay);
    pollAttempt++;

    let statusData: ExecStatusResponse;
    try {
      const statusRes = await client.get(
        `/nodes/${node}/qemu/${vmid}/agent/exec-status`,
        { params: { pid } }
      );
      statusData = statusRes.data?.data ?? {};
    } catch (err) {
      const axiosErr = err as AxiosError;
      logger.warn(`Poll attempt ${pollAttempt} failed: ${axiosErr.message}`);
      // Keep polling unless we're out of time
      continue;
    }

    partialOutput = statusData["out-data"] ?? "";

    if (statusData.exited === 1) {
      // Command has finished
      const exitCode = statusData.exitcode ?? 0;
      const stdout = statusData["out-data"] ?? "";
      const stderr = statusData["err-data"] ?? "";
      const outTruncated = statusData["out-truncated"] === 1;
      const errTruncated = statusData["err-truncated"] === 1;

      logger.info(`Command finished: PID=${pid}, exitCode=${exitCode}`);

      const formattedOutput = {
        success: exitCode === 0,
        exitCode,
        output: stdout || null,
        error: stderr || null,
        outTruncated: outTruncated || undefined,
        errTruncated: errTruncated || undefined,
        node,
        vmid,
        command,
      };

      if (exitCode === 0) {
        return ResponseFormatter.success(
          `Command executed successfully in VM ${vmid}`,
          formattedOutput
        );
      } else {
        return ResponseFormatter.error(
          `Command exited with code ${exitCode}`,
          JSON.stringify(formattedOutput, null, 2)
        );
      }
    }

    // Not done yet — continue polling
    logger.debug(`Poll attempt ${pollAttempt}: command still running (PID=${pid})`);
  }

  // Timeout
  return ResponseFormatter.error(
    "Command execution timeout",
    `Command '${command}' in VM ${vmid} did not complete within ${timeoutMs}ms. ` +
      `PID=${pid}.` +
      (partialOutput ? ` Partial output so far: ${partialOutput}` : "")
  );
}
