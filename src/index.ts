#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GameClient } from "./game-client.js";
import { registerAllTools } from "./tools/index.js";
import { Config } from "./types/game.js";

// Get configuration from environment
const config: Config = {
  projectPath: process.env.GAME_PROJECT_PATH,
  port: parseInt(process.env.GAME_PORT || "6789", 10),
  godotPath: process.env.GODOT_PATH || "godot",
  connectTimeoutMs: parseInt(process.env.CONNECT_TIMEOUT_MS || "5000", 10),
  commandTimeoutMs: parseInt(process.env.COMMAND_TIMEOUT_MS || "10000", 10),
};

// Create game client
const client = new GameClient(config);

// Create MCP server
const server = new McpServer({
  name: "game-mcp",
  version: "1.0.0",
});

// Register all tools
registerAllTools(server, client);

// Handle shutdown
process.on("SIGINT", async () => {
  console.error("Shutting down...");
  await client.shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.error("Shutting down...");
  await client.shutdown();
  process.exit(0);
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Game MCP server running.`);
  console.error(`  Port: ${config.port}`);
  console.error(`  Godot: ${config.godotPath}`);
  if (config.projectPath) {
    console.error(`  Project: ${config.projectPath}`);
  }
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
