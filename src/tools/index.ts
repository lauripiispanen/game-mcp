import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TextContent, ImageContent } from "@modelcontextprotocol/sdk/types.js";
import { GameClient } from "../game-client.js";
import {
  GameConnectParamsSchema,
  GameCommandParamsSchema,
} from "../types/game.js";

export function registerAllTools(server: McpServer, client: GameClient) {
  // game_connect
  server.tool(
    "game_connect",
    "Establishes connection to the game, launching it if necessary. Returns available commands from the game's DevServer.",
    GameConnectParamsSchema.shape,
    async (params: z.infer<typeof GameConnectParamsSchema>) => {
      try {
        const result = await client.connect({
          projectPath: params.project_path,
          restart: params.restart,
          port: params.port,
          timeoutMs: params.timeout_ms,
        });

        if (!result.connected) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: result.error || "Failed to connect to game",
              },
            ],
          };
        }

        // Format commands list for display
        let commandsText = "Connected to game.\n\n## Available Commands\n\n";
        if (result.commands && result.commands.length > 0) {
          for (const cmd of result.commands) {
            commandsText += `### ${cmd.name}\n`;
            commandsText += `${cmd.description}\n`;
            if (cmd.args && Object.keys(cmd.args).length > 0) {
              commandsText += "**Arguments:**\n";
              for (const [argName, argInfo] of Object.entries(cmd.args)) {
                const optional = argInfo.optional ? " (optional)" : "";
                commandsText += `- \`${argName}\`: ${argInfo.type}${optional}`;
                if (argInfo.description) {
                  commandsText += ` - ${argInfo.description}`;
                }
                commandsText += "\n";
              }
            }
            commandsText += "\n";
          }
        } else {
          commandsText += "No commands available.\n";
        }

        return {
          content: [
            {
              type: "text" as const,
              text: commandsText,
            },
          ],
          structuredContent: {
            connected: true,
            commands: result.commands,
            game_version: result.gameVersion,
          },
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to connect: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // game_command
  server.tool(
    "game_command",
    "Sends a command to the game and returns the result. Requires game_connect to be called first.",
    GameCommandParamsSchema.shape,
    async (params: z.infer<typeof GameCommandParamsSchema>) => {
      try {
        if (!client.isConnected()) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: "Not connected. Call game_connect first.",
              },
            ],
          };
        }

        const response = await client.sendCommand(
          params.command,
          params.args || {},
          params.timeout_ms
        );

        if (!response.success) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: response.error || "Command failed",
              },
            ],
          };
        }

        // Build response content
        const content: (TextContent | ImageContent)[] = [];

        // Add image first if present (so Claude sees it prominently)
        if (response.image) {
          // Validate base64 image
          try {
            const decoded = Buffer.from(response.image, "base64");
            // Check PNG header (89 50 4E 47 = 0x89 P N G)
            if (decoded.length >= 4 &&
                decoded[0] === 0x89 &&
                decoded[1] === 0x50 &&
                decoded[2] === 0x4e &&
                decoded[3] === 0x47) {
              content.push({
                type: "image",
                data: response.image,
                mimeType: "image/png",
              } as ImageContent);
            } else {
              content.push({
                type: "text",
                text: "[Warning: Image data does not appear to be valid PNG]",
              } as TextContent);
            }
          } catch (err) {
            content.push({
              type: "text",
              text: `[Warning: Invalid base64 image data: ${(err as Error).message}]`,
            } as TextContent);
          }
        }

        // Add data as text if present
        if (response.data !== undefined) {
          content.push({
            type: "text",
            text: typeof response.data === "string"
              ? response.data
              : JSON.stringify(response.data, null, 2),
          } as TextContent);
        }

        // If no content was added, add a success message
        if (content.length === 0) {
          content.push({
            type: "text",
            text: "Command executed successfully.",
          } as TextContent);
        }

        return {
          content,
          isError: false,
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Command failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
