# @bakhshb/proxmox-mcp-openapi

[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) **Open Source**

An **OpenAPI-driven 2-tool MCP server** for Proxmox VE. Instead of defining 35+ explicit tools, it exposes just 2 generic tools that can execute any of the 480+ Proxmox API operations dynamically — plus dedicated tools for executing commands inside VMs and containers.

**Saves ~95% tokens** compared to traditional explicit-tool MCP servers.

---

## Tools

### `proxmox-api`
Execute any Proxmox VE API operation dynamically.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | yes | API path, e.g. `/nodes/{node}/qemu/{vmid}/status/current` |
| `method` | enum | no | HTTP method (auto-detected if omitted) |
| `pathParams` | object | no | Path parameter values, e.g. `{"node": "pve", "vmid": 100}` |
| `params` | object | no | Query params (GET) or request body (POST/PUT/PATCH) |

### `proxmox-api-schema`
Discover available API operations from the OpenAPI spec.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `tag` | string | no | Filter by tag: `nodes`, `cluster`, `storage`, `access`, `pools` |
| `path` | string | no | Get details for a specific path |
| `method` | enum | no | Filter by HTTP method |

### `proxmox-execute-container-command`
Execute shell commands inside LXC containers via SSH + `pct exec`.

> **Note:** The Proxmox REST API has no endpoint for LXC command execution. This tool SSHes to the Proxmox node and runs `pct exec` locally.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `node` | string | yes | Proxmox node name (e.g. `pve`) |
| `vmid` | string\|number | yes | Container ID (e.g. `110`) |
| `command` | string | yes | Shell command to run inside the container |

**Returns:** `{ success, exitCode, output, error, node, vmid, command }`

### `proxmox-execute-vm-command`
Execute commands inside VMs via QEMU guest agent.

> **Requirements:** VM must be running with `qemu-guest-agent` installed inside the guest.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `node` | string | no | Proxmox node name (default: `pve`) |
| `vmid` | number | yes | VM ID (e.g. `100`) |
| `command` | string | yes | Single executable with args (no pipes/redirects) |
| `timeoutMs` | number | no | Timeout in ms (default: `30000`) |

**Returns:** `{ success, exitCode, output, error, outTruncated?, errTruncated? }`

---

## Installation

### Prerequisites

- **Node.js** 18+ 
- **npm** or **yarn**
- Proxmox VE instance with API token
- For container commands: SSH key access to Proxmox node

### Option 1: Clone and Build

```bash
# Clone the repository
git clone https://github.com/bakhshb/proxmox-mcp-openapi.git
cd proxmox-mcp-openapi

# Install dependencies
npm install

# Build TypeScript
npm run build
```

### Option 2: npm Package (when published)

```bash
npm install -g proxmox-mcp-openapi
```

Then register with your MCP client (see [MCP Client Configuration](#mcp-client-configuration)).

---

## Configuration

### Environment Variables

```bash
cp .env.example .env
```

**Required:**
| Variable | Description |
|----------|-------------|
| `PROXMOX_URL` | Base URL including `/api2/json`, e.g. `https://pve.example.com:8006/api2/json` |
| `PROXMOX_API_TOKEN` | Token in `user@realm!tokenid=secret` format |

**Optional:**
| Variable | Default | Description |
|----------|---------|-------------|
| `PROXMOX_INSECURE` | `false` | Skip TLS cert verification (for self-signed certs) |
| `PROXMOX_TIMEOUT` | `30000` | Request timeout in ms |
| `PROXMOX_SSH_KEY_PATH` | `~/.ssh/proxmox_mcp` | Path to SSH private key |
| `PROXMOX_SSH_USER` | `root` | SSH username |
| `PROXMOX_SSH_PORT` | `22` | SSH port |

### Proxmox API Token Setup

1. In Proxmox Web UI: **Datacenter → Permissions → API Tokens → Add**
2. Copy the token in format: `user@realm!tokenid=secret`
3. Assign appropriate permissions to the token (e.g. PVEAuditor for read-only, PVEEditor for modifications)

### SSH Key Setup (for Container Commands)

```bash
# Generate SSH key
ssh-keygen -t ed25519 -f ~/.ssh/proxmox_mcp

# Add public key to Proxmox
# Copy: cat ~/.ssh/proxmox_mcp.pub
# Paste in: Proxmox Web UI → Permissions → SSH Keys → Add
```

---

## MCP Client Configuration

### OpenClaw

```json
{
  "mcp": {
    "servers": {
      "proxmox-mcp-openapi": {
        "command": "node",
        "args": ["/absolute/path/to/proxmox-mcp-openapi/build/index.js"],
        "env": {
          "PROXMOX_URL": "https://your-proxmox:8006/api2/json",
          "PROXMOX_API_TOKEN": "root@pam!mytoken=your-secret",
          "PROXMOX_INSECURE": "true",
          "PROXMOX_SSH_KEY_PATH": "~/.ssh/proxmox_mcp"
        }
      }
    }
  }
}
```

### Claude Desktop

```json
{
  "mcpServers": {
    "proxmox-mcp-openapi": {
      "command": "node",
      "args": ["/absolute/path/to/proxmox-mcp-openapi/build/index.js"],
      "env": {
        "PROXMOX_URL": "https://your-proxmox:8006/api2/json",
        "PROXMOX_API_TOKEN": "root@pam!mytoken=your-secret",
        "PROXMOX_INSECURE": "true",
        "PROXMOX_SSH_KEY_PATH": "~/.ssh/proxmox_mcp"
      }
    }
  }
}
```

### VS Code Copilot

Add the same configuration to `settings.json` under `mcp.servers`.

---

## Usage Examples

### API Operations

```javascript
// Get VM status
proxmox-api path="/nodes/pve/qemu/100/status/current"

// List all VMs
proxmox-api path="/nodes/pve/qemu"

// Start a VM
proxmox-api path="/nodes/pve/qemu/100/status/start" method=POST

// Get cluster resources
proxmox-api path="/cluster/resources"

// Discover storage operations
proxmox-api-schema tag="storage"

// Get parameters for a specific endpoint
proxmox-api-schema path="/nodes/{node}/qemu/{vmid}/config"
```

### Container Commands

```javascript
// Get OS version
proxmox-execute-container-command node="pve" vmid=110 command="cat /etc/os-release"

// Check hostname
proxmox-execute-container-command node="pve" vmid=110 command="hostname"

// Disk usage
proxmox-execute-container-command node="pve" vmid=110 command="df -h"

// Update packages
proxmox-execute-container-command node="pve" vmid=110 command="apt update && apt upgrade -y"
```

### VM Commands

```javascript
// Simple command
proxmox-execute-vm-command node="pve" vmid=100 command="hostname"
// → { success: true, output: "dokploy-swarm-1" }

// Check disk space (note: no flags, QEMU agent limitation)
proxmox-execute-vm-command node="pve" vmid=100 command="df"
// → { success: true, output: "Filesystem..." }

// For shell features (pipes, redirects), use proxmox-api directly:
// 1. POST /agent/exec with input-data for stdin
// 2. GET /agent/exec-status?pid=<pid>
```

---

## Token Savings

### Comparison with Traditional MCP Architecture

| MCP Server | Architecture | Tools | Token Cost |
|------------|--------------|-------|------------|
| **Traditional Proxmox MCP** | One tool per API operation | ~35 explicit tools | ~15,000–20,000 tokens |
| **proxmox-mcp-openapi** | OpenAPI-driven dynamic | 2 generic tools + 2 exec tools | ~500–1,000 tokens |

**Result: ~95% token reduction**

### Why Tokens Matter

MCP servers send their tool schemas to the LLM on every request. With a 200k token context window:
- Traditional approach: 15-20k tokens just for schema, leaving less room for actual work
- OpenAPI-driven: ~500 tokens, leaving the context window for your data

### How It Works

Instead of hardcoding all tools:
```typescript
// Traditional: 35+ explicit tools
server.tool("list_nodes", {...})
server.tool("get_vm_status", {...})
server.tool("start_vm", {...})
// ... 30 more

// OpenAPI-driven: 2 dynamic tools
server.tool("proxmox-api", {...})           // executes any API operation
server.tool("proxmox-api-schema", {...})    // discovers available operations
```

The schema is loaded from the OpenAPI spec at startup, not hardcoded in the tools.

---

## Inspiration

This project builds on two key inspirations:

1. **[ProxmoxMCP-Plus](https://github.com/bakhshb/proxmox-mcp)** — The original 35-tool Python MCP server for Proxmox VE. It proved the full API surface area but carried high token overhead.

2. **[limehawk/dokploy-mcp](https://github.com/limehawk/dokploy-mcp)** — Demonstrated that a 2-tool OpenAPI-driven pattern could dramatically reduce token costs while maintaining full API coverage.

The proxmox-mcp-openapi takes the best of both: the dynamic OpenAPI approach from dokploy-mcp applied to Proxmox, with the additional SSH-based container command execution tools carried over from ProxmoxMCP-Plus.

### Architecture Pattern

```
Traditional MCP:   35 tools × detailed schemas = 15k+ tokens
                   ↓
OpenAPI-driven:    2 tools + runtime schema loading = ~500 tokens
                   ↓
Result:           95% token reduction with full API coverage
```

---

## Architecture

- **2 core tools** + **2 execution tools**
- **OpenAPI-driven**: 480 operations dynamically loaded from spec
- **TypeScript**: Type-safe, compiled to JavaScript
- **Pure REST API**: No Proxmox Perl library dependencies
- **SSH key auth** for container commands (no API token needed for LXC exec)
- **Exec tools carried over** from the original ProxmoxMCP-Plus (SSH+pct for LXC, QEMU agent for VMs)

### OpenAPI Spec

Includes the Proxmox VE API v2 specification with 480 operations across:
- `cluster` (122 operations)
- `nodes` (311 operations)
- `storage` (5 operations)
- `access` (36 operations)
- `pools` (5 operations)
- `version` (1 operation)

---

## Troubleshooting

### "Access denied" on container command
1. Verify SSH key added to Proxmox Web UI → Permissions → SSH Keys
2. Verify container is **running** (not stopped)
3. Test SSH manually: `ssh -i ~/.ssh/proxmox_mcp root@<proxmox-host>`

### "SSH connection timeout"
1. Check `node` parameter is correct (use node name like `pve`, not IP)
2. Verify SSH is running on Proxmox node
3. Check firewall allows port 22

### API returns 401/403
1. Verify token format: `user@realm!tokenid=secret` (not just the UUID)
2. Check token has appropriate permissions in Proxmox

### VM command fails with 596
- QEMU agent doesn't support shell features (pipes, redirects)
- Use `proxmox-api` directly with `input-data` for stdin

### VM command fails with 404
- QEMU guest agent not installed or not running inside the VM
- Install with: `apt install qemu-guest-agent` (Linux) or enable via Hyper-V/VMware tools

---

## License

MIT
