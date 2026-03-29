# proxmox-mcp-openapi

An OpenAPI-driven MCP server for the Proxmox VE API with two generic tools.

## Tools

### `proxmox-api`
Execute any Proxmox VE API operation. HTTP method is auto-detected from the OpenAPI spec. Supports path parameter substitution.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | string | yes | API path from spec, e.g. `/nodes/{node}/qemu/{vmid}/status/current` |
| `method` | enum | no | HTTP method (auto-detected if omitted) |
| `pathParams` | object | no | Path parameter values, e.g. `{ "node": "pve", "vmid": 100 }` |
| `params` | object | no | Query params (GET/DELETE) or request body (POST/PUT/PATCH) |

### `proxmox-api-schema`
Discover available API operations and their parameters from the OpenAPI spec.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tag` | string | no | Filter by tag, e.g. `nodes`, `cluster`, `storage`, `access` |
| `path` | string | no | Get details for a specific path |
| `method` | enum | no | Filter by HTTP method (used with `path`) |

Call with no parameters to see a summary of available tags.

## Setup

### 1. Install dependencies

```bash
npm install
npm run build
```

### 2. Configure environment

Copy `.env.example` and fill in your Proxmox credentials:

```bash
cp .env.example .env
```

**Required:**
- `PROXMOX_URL` — Base URL including `/api2/json`, e.g. `https://pve.example.com:8006/api2/json`
- `PROXMOX_API_TOKEN` — API token in `user@realm!tokenid=secret` format

**Optional:**
- `PROXMOX_INSECURE=true` — Skip TLS certificate verification (self-signed certs)
- `PROXMOX_TIMEOUT` — Request timeout ms (default: 30000)

### API Token Auth

Create an API token in Proxmox:
1. Datacenter → Permissions → API Tokens → Add
2. Set the token value as: `PROXMOX_API_TOKEN=root@pam!mytoken=<uuid>`

### 3. Register with Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json` (or macOS equivalent):

```json
{
  "mcpServers": {
    "proxmox": {
      "command": "node",
      "args": ["/path/to/proxmox-mcp-openapi/build/index.js"],
      "env": {
        "PROXMOX_URL": "https://your-proxmox:8006/api2/json",
        "PROXMOX_API_TOKEN": "root@pam!mytoken=your-secret",
        "PROXMOX_INSECURE": "true"
      }
    }
  }
}
```

## Usage Examples

**List all VMs on a node:**
```
proxmox-api path=/nodes/{node}/qemu pathParams={"node":"pve"}
```

**Get VM status:**
```
proxmox-api path=/nodes/{node}/qemu/{vmid}/status/current pathParams={"node":"pve","vmid":100}
```

**Start a VM:**
```
proxmox-api path=/nodes/{node}/qemu/{vmid}/status/start method=POST pathParams={"node":"pve","vmid":100}
```

**Discover cluster operations:**
```
proxmox-api-schema tag=cluster
```

**Get parameters for a path:**
```
proxmox-api-schema path=/nodes/{node}/qemu/{vmid}/config
```

## OpenAPI Spec

The spec is loaded from `reference/spec.v2.yaml` (symlinked to `proxmox-ve-openapi`).
The spec covers Proxmox VE API v2 with 241 GET and 132 POST operations across tags:
`cluster`, `nodes`, `storage`, `access`, `pools`, `version`.
