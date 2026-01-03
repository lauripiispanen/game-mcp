import { Socket } from "net";
import { spawn, ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import {
  ConnectionState,
  GameRequest,
  GameResponse,
  GameResponseSchema,
  CommandInfo,
  ListCommandsResponseSchema,
  Config,
} from "./types/game.js";

interface PendingRequest {
  resolve: (response: GameResponse) => void;
  reject: (error: Error) => void;
  timeoutHandle: NodeJS.Timeout;
}

export class GameClient {
  private socket: Socket | null = null;
  private state: ConnectionState = "disconnected";
  private buffer: string = "";
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private gameProcess: ChildProcess | null = null;
  private config: Config;
  private availableCommands: CommandInfo[] = [];

  constructor(config: Config) {
    this.config = config;
  }

  getState(): ConnectionState {
    return this.state;
  }

  getAvailableCommands(): CommandInfo[] {
    return this.availableCommands;
  }

  isConnected(): boolean {
    return this.state === "connected" && this.socket !== null;
  }

  async connect(options: {
    projectPath?: string;
    restart?: boolean;
    port?: number;
    timeoutMs?: number;
  }): Promise<{ connected: boolean; commands?: CommandInfo[]; gameVersion?: string; error?: string }> {
    const projectPath = options.projectPath || this.config.projectPath;
    const port = options.port || this.config.port;
    const timeoutMs = options.timeoutMs || this.config.connectTimeoutMs;

    if (!projectPath) {
      return {
        connected: false,
        error: "No project path specified. Set GAME_PROJECT_PATH or provide project_path parameter.",
      };
    }

    // Handle restart
    if (options.restart) {
      await this.killGame();
    }

    // If already connected, return current state
    if (this.isConnected()) {
      return {
        connected: true,
        commands: this.availableCommands,
      };
    }

    this.state = "connecting";

    // Try to connect, launch game if needed
    const startTime = Date.now();
    let lastError: Error | null = null;

    while (Date.now() - startTime < timeoutMs) {
      try {
        await this.tryConnect(port);

        // Connection successful, get command list
        const commands = await this.fetchCommands();
        this.availableCommands = commands;
        this.state = "connected";

        return {
          connected: true,
          commands,
        };
      } catch (err) {
        lastError = err as Error;

        // If connection refused, try to launch game
        if ((err as NodeJS.ErrnoException).code === "ECONNREFUSED") {
          if (!this.gameProcess) {
            try {
              await this.launchGame(projectPath);
            } catch (launchErr) {
              return {
                connected: false,
                error: `Failed to launch game: ${(launchErr as Error).message}`,
              };
            }
          }
          // Wait before retry with exponential backoff
          const elapsed = Date.now() - startTime;
          const waitTime = Math.min(100 * Math.pow(2, Math.floor(elapsed / 1000)), 1000);
          await this.sleep(waitTime);
        } else {
          // Other error, fail immediately
          break;
        }
      }
    }

    this.state = "disconnected";
    return {
      connected: false,
      error: lastError?.message || `Connection timeout after ${timeoutMs}ms`,
    };
  }

  private tryConnect(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();

      const onConnect = () => {
        socket.removeListener("error", onError);
        this.socket = socket;
        this.setupSocketHandlers();
        resolve();
      };

      const onError = (err: Error) => {
        socket.removeListener("connect", onConnect);
        socket.destroy();
        reject(err);
      };

      socket.once("connect", onConnect);
      socket.once("error", onError);
      socket.connect(port, "127.0.0.1");
    });
  }

  private setupSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf-8");
      this.processBuffer();
    });

    this.socket.on("close", () => {
      this.handleDisconnect();
    });

    this.socket.on("error", (err) => {
      console.error("[GameClient] Socket error:", err.message);
      this.handleDisconnect();
    });
  }

  private processBuffer(): void {
    while (this.buffer.includes("\n")) {
      const newlineIndex = this.buffer.indexOf("\n");
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (line.trim()) {
        this.handleMessage(line);
      }
    }
  }

  private handleMessage(line: string): void {
    try {
      const parsed = JSON.parse(line);
      const response = GameResponseSchema.parse(parsed);

      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        clearTimeout(pending.timeoutHandle);
        this.pendingRequests.delete(response.id);
        pending.resolve(response);
      }
    } catch (err) {
      console.error("[GameClient] Failed to parse message:", err);
    }
  }

  private handleDisconnect(): void {
    this.state = "disconnected";
    this.socket = null;
    this.buffer = "";

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutHandle);
      pending.reject(new Error("Connection lost during command execution"));
    }
    this.pendingRequests.clear();
  }

  private async fetchCommands(): Promise<CommandInfo[]> {
    try {
      const response = await this.sendCommand("list_commands", {}, 5000);
      if (response.success && response.data) {
        const parsed = ListCommandsResponseSchema.safeParse(response.data);
        if (parsed.success) {
          return parsed.data.commands;
        }
      }
      return [];
    } catch (err) {
      console.error("[GameClient] Failed to fetch commands:", err);
      return [];
    }
  }

  async sendCommand(
    command: string,
    args: Record<string, unknown> = {},
    timeoutMs?: number
  ): Promise<GameResponse> {
    if (!this.isConnected() || !this.socket) {
      return {
        id: "",
        success: false,
        error: "Not connected. Call game_connect first.",
      };
    }

    const timeout = timeoutMs || this.config.commandTimeoutMs;
    const id = randomUUID();

    const request: GameRequest = {
      id,
      command,
      args,
    };

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(id);
        resolve({
          id,
          success: false,
          error: `Command timeout after ${timeout}ms`,
        });
      }, timeout);

      this.pendingRequests.set(id, { resolve, reject, timeoutHandle });

      const message = JSON.stringify(request) + "\n";
      this.socket!.write(message, (err) => {
        if (err) {
          clearTimeout(timeoutHandle);
          this.pendingRequests.delete(id);
          resolve({
            id,
            success: false,
            error: `Failed to send command: ${err.message}`,
          });
        }
      });
    });
  }

  private async launchGame(projectPath: string): Promise<void> {
    const godotPath = this.config.godotPath;

    return new Promise((resolve, reject) => {
      try {
        this.gameProcess = spawn(godotPath, ["--path", projectPath], {
          detached: false,
          stdio: "ignore",
        });

        this.gameProcess.on("error", (err) => {
          this.gameProcess = null;
          reject(new Error(`Failed to launch Godot: ${err.message}`));
        });

        this.gameProcess.on("exit", (code) => {
          this.gameProcess = null;
          if (this.state === "connecting") {
            reject(new Error(`Game process exited unexpectedly with code ${code}`));
          }
        });

        // Give the process a moment to start
        setTimeout(resolve, 100);
      } catch (err) {
        reject(err);
      }
    });
  }

  async killGame(): Promise<void> {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    if (this.gameProcess) {
      try {
        this.gameProcess.kill("SIGTERM");
        // Wait a bit, then force kill if needed
        await this.sleep(500);
        if (this.gameProcess && !this.gameProcess.killed) {
          this.gameProcess.kill("SIGKILL");
        }
      } catch (err) {
        // Process may already be dead
      }
      this.gameProcess = null;
    }

    this.state = "disconnected";
    this.buffer = "";
    this.pendingRequests.clear();
  }

  async shutdown(): Promise<void> {
    await this.killGame();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
