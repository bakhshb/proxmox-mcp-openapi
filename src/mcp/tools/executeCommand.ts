import { z } from "zod";
import { Client, ConnectConfig } from "ssh2";
import { createLogger } from "../../utils/logger.js";
import { ResponseFormatter } from "../../utils/responseFormatter.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const logger = createLogger("ExecuteCommand");

export const schema = {
  node: z
    .string()
    .min(1)
    .describe("Proxmox node name (e.g. 'pve', 'pve1')"),
  vmid: z
    .union([z.string(), z.number()])
    .describe("Container ID (e.g. 110, '110')"),
  command: z
    .string()
    .min(1)
    .describe("Shell command to run inside the container"),
};

export const name = "proxmox-execute-container-command";

export const description =
  "Execute a shell command inside a running LXC container via SSH + pct exec. Uses SSH key to connect to the Proxmox node and runs 'pct exec <vmid> -- <command>' inside the container. Requires the container to be running. Configure SSH via PROXMOX_SSH_KEY_PATH, PROXMOX_SSH_USER, PROXMOX_SSH_PORT environment variables.";

export const annotations = {
  title: "Execute Container Command",
  readOnlyHint: false,
  openWorldHint: false,
};

interface ExecuteResult {
  success: boolean;
  output: string;
  error: string;
  exitCode: number;
}

function getSSHConfig() {
  return {
    keyPath: process.env.PROXMOX_SSH_KEY_PATH || path.join(os.homedir(), ".ssh", "proxmox_mcp"),
    user: process.env.PROXMOX_SSH_USER || "root",
    port: parseInt(process.env.PROXMOX_SSH_PORT || "22", 10),
  };
}

async function executeCommandOverSSH(
  node: string,
  command: string
): Promise<ExecuteResult> {
  return new Promise((resolve) => {
    const sshConfig = getSSHConfig();
    const host = node; // Node name used as hostname

    logger.info(`SSH connecting to ${host}:${sshConfig.port} for command execution`);

    const conn = new Client();

    const timeout = setTimeout(() => {
      conn.end();
      resolve({
        success: false,
        output: "",
        error: "SSH connection timeout (30s)",
        exitCode: -1,
      });
    }, 30000);

    conn.on("ready", () => {
      logger.info(`SSH connected to ${host}, executing: ${command}`);
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          resolve({
            success: false,
            output: "",
            error: `SSH exec error: ${err.message}`,
            exitCode: -1,
          });
          return;
        }

        let stdout = "";
        let stderr = "";

        stream.on("close", (code: number) => {
          clearTimeout(timeout);
          conn.end();
          resolve({
            success: code === 0,
            output: stdout,
            error: stderr,
            exitCode: code,
          });
        });

        stream.on("data", (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timeout);
      logger.error(`SSH connection error: ${err.message}`);
      resolve({
        success: false,
        output: "",
        error: `SSH connection error: ${err.message}`,
        exitCode: -1,
      });
    });

    try {
      // Read private key
      const privateKey = fs.readFileSync(sshConfig.keyPath, "utf-8");

      const connectConfig: ConnectConfig = {
        host,
        port: sshConfig.port,
        username: sshConfig.user,
        privateKey,
        readyTimeout: 10000,
        // Skip host key verification for simplicity
        // In production, users should configure known_hosts properly
      };

      conn.connect(connectConfig);
    } catch (err) {
      clearTimeout(timeout);
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      logger.error(`Failed to read SSH key: ${errorMsg}`);
      resolve({
        success: false,
        output: "",
        error: `Failed to read SSH key at ${sshConfig.keyPath}: ${errorMsg}`,
        exitCode: -1,
      });
    }
  });
}

export async function handler(input: {
  node: string;
  vmid: string | number;
  command: string;
}) {
  const { node, vmid, command } = input;

  logger.info(
    `execute_container_command: node=${node}, vmid=${vmid}, command=${command}`
  );

  // Build the pct exec command
  const pctCommand = `pct exec ${Number(vmid)} -- sh -c ${JSON.stringify(command)}`;

  try {
    const result = await executeCommandOverSSH(node, pctCommand);

    if (result.exitCode === -1 && result.error.includes("timeout")) {
      return ResponseFormatter.error(
        "Command execution timeout",
        `SSH connection to node '${node}' timed out after 30 seconds. Check if the node is reachable and SSH is running.`
      );
    }

    if (result.exitCode === -1) {
      return ResponseFormatter.error(
        "Command execution failed",
        result.error
      );
    }

    // Format the successful result
    const outputLines = result.output.split("\n").filter((l) => l.length > 0);
    const errorLines = result.error.split("\n").filter((l) => l.length > 0);

    const formattedOutput = {
      success: result.success,
      exitCode: result.exitCode,
      output: outputLines.length > 0 ? outputLines : null,
      error: errorLines.length > 0 ? errorLines : null,
      node,
      vmid: Number(vmid),
      command,
    };

    if (result.success) {
      return ResponseFormatter.success(
        `Command executed successfully in container ${vmid}`,
        formattedOutput
      );
    } else {
      return ResponseFormatter.error(
        `Command exited with code ${result.exitCode}`,
        JSON.stringify(formattedOutput, null, 2)
      );
    }
  } catch (err) {
    logger.error("execute_container_command exception", {
      error: err instanceof Error ? err.message : "Unknown error",
    });
    return ResponseFormatter.error(
      "execute_container_command failed",
      err instanceof Error ? err.message : "Unknown error"
    );
  }
}
