# Game MCP Server

A thin MCP (Model Context Protocol) server that bridges AI assistants to running game instances for testing, debugging, and verification.

## Overview

This server acts as a proxy between Claude (or any MCP-compatible AI) and your game. It:

- Launches your game process if not already running
- Maintains a TCP connection for bidirectional communication
- Forwards commands from the AI to your game
- Returns responses, including screenshots, back to the AI

**Engine-agnostic**: Works with any game engine (Godot, Unity, Unreal, custom) as long as your game implements the simple TCP protocol.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AI Assistant (Claude)                        │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │ MCP Protocol (stdio)
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Game MCP Server                              │
│                                                                      │
│  - Launches game process if needed                                   │
│  - TCP connection to game (default port 6789)                        │
│  - Forwards commands, returns responses                              │
│  - Handles screenshots as MCP ImageContent                           │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │ TCP + JSON (newline-delimited)
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Your Game (with DevServer)                        │
│                                                                      │
│  - Listens on TCP port                                               │
│  - Executes commands, returns results                                │
│  - You implement the command handlers                                │
└─────────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
bun install
```

## Configuration

Configure via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `GAME_PROJECT_PATH` | (none) | Path to your game/project directory |
| `GAME_PORT` | `6789` | TCP port for game communication |
| `GODOT_PATH` | `godot` | Command to launch your game |
| `CONNECT_TIMEOUT_MS` | `5000` | Connection timeout |
| `COMMAND_TIMEOUT_MS` | `10000` | Command response timeout |

## Claude Code Integration

Add to your Claude Code MCP config (`~/.config/claude-code/settings.json`):

```json
{
  "mcpServers": {
    "game": {
      "command": "bun",
      "args": ["run", "/path/to/game-mcp/src/index.ts"],
      "env": {
        "GAME_PROJECT_PATH": "/path/to/your/game",
        "GODOT_PATH": "godot"
      }
    }
  }
}
```

For non-Godot engines, set `GODOT_PATH` to whatever command launches your game.

## MCP Tools

### game_connect

Connects to the game, launching it if necessary.

**Parameters:**
- `project_path` (string, optional): Override the game project path
- `restart` (boolean, optional): Kill and relaunch the game
- `port` (integer, optional): TCP port (default: 6789)
- `timeout_ms` (integer, optional): Connection timeout

**Returns:** List of available commands from the game.

### game_command

Sends a command to the game.

**Parameters:**
- `command` (string, required): Command name
- `args` (object, optional): Command arguments
- `timeout_ms` (integer, optional): Response timeout

**Returns:** Command result, potentially including image data.

## Game-Side Protocol

Your game needs to implement a TCP server that:

1. Listens on the configured port (default 6789)
2. Accepts newline-delimited JSON messages
3. Responds with newline-delimited JSON

### Request Format

```json
{"id": "uuid", "command": "command_name", "args": {"key": "value"}}
```

### Response Format

```json
{"id": "uuid", "success": true, "data": {...}}
```

With image:
```json
{"id": "uuid", "success": true, "data": {}, "image": "base64-encoded-png"}
```

Error:
```json
{"id": "uuid", "success": false, "error": "Error message"}
```

### Required Command: list_commands

Your game should implement `list_commands` to tell the AI what's available:

```json
// Request
{"id": "1", "command": "list_commands", "args": {}}

// Response
{
  "id": "1",
  "success": true,
  "data": {
    "commands": [
      {
        "name": "screenshot",
        "description": "Capture the game viewport",
        "args": {
          "scale": {"type": "number", "optional": true}
        }
      },
      {
        "name": "get_player_state",
        "description": "Get player position and health",
        "args": {}
      }
    ]
  }
}
```

## Example Commands

Common commands you might implement in your game:

| Command | Description |
|---------|-------------|
| `screenshot` | Capture viewport as PNG |
| `player_state` | Get player position, health, etc. |
| `teleport` | Move player to coordinates |
| `spawn` | Spawn entities for testing |
| `get_errors` | Retrieve recent error logs |
| `performance` | Get FPS and performance metrics |

## License

MIT
