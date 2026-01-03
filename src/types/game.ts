import { z } from "zod";

// Connection state
export const ConnectionStateSchema = z.enum(["disconnected", "connecting", "connected"]);
export type ConnectionState = z.infer<typeof ConnectionStateSchema>;

// Game request sent over TCP
export const GameRequestSchema = z.object({
  id: z.string(),
  command: z.string(),
  args: z.record(z.unknown()).optional(),
});
export type GameRequest = z.infer<typeof GameRequestSchema>;

// Game response received over TCP
export const GameResponseSchema = z.object({
  id: z.string(),
  success: z.boolean(),
  data: z.unknown().optional(),
  image: z.string().optional(),
  error: z.string().optional(),
});
export type GameResponse = z.infer<typeof GameResponseSchema>;

// Command info from list_commands
export const CommandArgSchema = z.object({
  type: z.string(),
  optional: z.boolean().optional(),
  description: z.string().optional(),
});

export const CommandInfoSchema = z.object({
  name: z.string(),
  description: z.string(),
  args: z.record(CommandArgSchema).optional(),
});
export type CommandInfo = z.infer<typeof CommandInfoSchema>;

// list_commands response data
export const ListCommandsResponseSchema = z.object({
  commands: z.array(CommandInfoSchema),
});

// Configuration
export const ConfigSchema = z.object({
  projectPath: z.string().optional(),
  port: z.number().default(6789),
  godotPath: z.string().default("godot"),
  connectTimeoutMs: z.number().default(5000),
  commandTimeoutMs: z.number().default(10000),
});
export type Config = z.infer<typeof ConfigSchema>;

// MCP Tool parameter schemas
export const GameConnectParamsSchema = z.object({
  project_path: z.string().optional().describe("Path to Godot project directory"),
  restart: z.boolean().optional().default(false).describe("Kill existing game and relaunch"),
  port: z.number().optional().describe("TCP port to connect on (default: 6789)"),
  timeout_ms: z.number().optional().describe("Connection timeout in milliseconds (default: 5000)"),
});
export type GameConnectParams = z.infer<typeof GameConnectParamsSchema>;

export const GameCommandParamsSchema = z.object({
  command: z.string().describe("Command name to execute"),
  args: z.record(z.unknown()).optional().describe("Command-specific arguments"),
  timeout_ms: z.number().optional().describe("Response timeout in milliseconds (default: 10000)"),
});
export type GameCommandParams = z.infer<typeof GameCommandParamsSchema>;

// MCP Tool response types
export const GameConnectResultSchema = z.object({
  connected: z.boolean(),
  commands: z.array(CommandInfoSchema).optional(),
  game_version: z.string().optional(),
  error: z.string().optional(),
});
export type GameConnectResult = z.infer<typeof GameConnectResultSchema>;

export const ImageContentSchema = z.object({
  type: z.literal("image"),
  data: z.string(),
  mimeType: z.literal("image/png"),
});
export type ImageContent = z.infer<typeof ImageContentSchema>;

export const GameCommandResultSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  image: ImageContentSchema.optional(),
  error: z.string().optional(),
});
export type GameCommandResult = z.infer<typeof GameCommandResultSchema>;
