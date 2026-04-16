import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SearchType = 'all' | 'images';

export interface MetasearchServiceOptions {
  /** Explicit path to the metasearch binary. Resolved automatically when omitted. */
  binPath?: string;
  /** Port the metasearch HTTP API listens on. @default 28019 */
  port?: number;
  /** Directory where the metasearch config.toml lives. Auto-derived when omitted. */
  configDir?: string;
  /** How long to wait for the process to become ready (ms). @default 10_000 */
  startupTimeoutMs?: number;
  /** Interval between health-check polls during startup (ms). @default 200 */
  healthPollIntervalMs?: number;
  /** Timeout for individual search HTTP requests (ms). @default 15_000 */
  requestTimeoutMs?: number;
  /** Attempt `cargo install metasearch` when no binary is found. @default true */
  autoInstall?: boolean;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_PORT = 28019;
const DEFAULT_STARTUP_TIMEOUT_MS = 10_000;
const DEFAULT_HEALTH_POLL_INTERVAL_MS = 200;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const CARGO_INSTALL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes for compilation

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MetasearchService {
  private readonly port: number;
  private readonly startupTimeoutMs: number;
  private readonly healthPollIntervalMs: number;
  private readonly requestTimeoutMs: number;
  private readonly autoInstall: boolean;
  private readonly configDir: string;
  private binPath: string | undefined;
  private readonly url: string;

  private child: ChildProcess | undefined;
  private cleanupHandlers: (() => void)[] = [];

  constructor(options: MetasearchServiceOptions = {}) {
    this.port = options.port ?? (Number(process.env.METASEARCH_PORT) || DEFAULT_PORT);
    this.startupTimeoutMs = options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
    this.healthPollIntervalMs = options.healthPollIntervalMs ?? DEFAULT_HEALTH_POLL_INTERVAL_MS;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.autoInstall = options.autoInstall ?? (process.env.METASEARCH_AUTO_INSTALL !== 'false');
    this.binPath = options.binPath ?? MetasearchService.resolveBin();
    this.configDir =
      options.configDir ??
      path.join(
        process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'),
        'metasearch',
      );
    this.url = `http://localhost:${this.port}`;
  }

  // -----------------------------------------------------------------------
  // Binary resolution
  // -----------------------------------------------------------------------

  /** Platform-specific npm package map for bundled binaries. */
  private static readonly PLATFORM_PACKAGES: Record<string, string> = {
    'darwin-arm64': '@galelmalah/metasearch2-darwin-arm64',
    'darwin-x64': '@galelmalah/metasearch2-darwin-x64',
    'linux-x64': '@galelmalah/metasearch2-linux-x64',
    'linux-arm64': '@galelmalah/metasearch2-linux-arm64',
    'win32-x64': '@galelmalah/metasearch2-win32-x64',
  };

  /**
   * Locate the metasearch binary on disk.
   *
   * Resolution order:
   *   1. `METASEARCH_BIN` environment variable
   *   2. Bundled platform-specific npm package (`@galelmalah/metasearch2-*`)
   *   3. `$CARGO_HOME/bin/metasearch` (cargo install location)
   *   4. `/tmp/metasearch2-build/bin/metasearch`
   */
  static resolveBin(): string | undefined {
    const binaryName = process.platform === 'win32' ? 'metasearch.exe' : 'metasearch';

    // 1. Explicit env var
    const envBin = process.env.METASEARCH_BIN;
    if (envBin && fs.existsSync(envBin)) return envBin;

    // 2. Bundled platform package
    const platformKey = `${process.platform}-${process.arch}`;
    const pkg = MetasearchService.PLATFORM_PACKAGES[platformKey];
    if (pkg) {
      try {
        const pkgDir = path.dirname(require.resolve(`${pkg}/package.json`));
        const bundledBin = path.join(pkgDir, 'bin', binaryName);
        if (fs.existsSync(bundledBin)) return bundledBin;
      } catch {
        // package not installed
      }
    }

    // 3. Cargo install location
    const cargoHome = process.env.CARGO_HOME ?? path.join(os.homedir(), '.cargo');
    const cargoBin = path.join(cargoHome, 'bin', binaryName);
    if (fs.existsSync(cargoBin)) return cargoBin;

    // 4. Common build location
    const tmpBin = path.join(os.tmpdir(), 'metasearch2-build', 'bin', binaryName);
    if (fs.existsSync(tmpBin)) return tmpBin;

    return undefined;
  }

  /** Whether a usable binary was found. */
  get hasBinary(): boolean {
    return this.binPath !== undefined;
  }

  // -----------------------------------------------------------------------
  // Auto-install
  // -----------------------------------------------------------------------

  /**
   * Attempt to install metasearch via `cargo install metasearch`.
   * Returns the resolved binary path on success, or `undefined` on failure.
   */
  private async installViaCargo(): Promise<string | undefined> {
    const cargoCheck = spawnSync('cargo', ['--version'], { stdio: 'ignore' });
    if (cargoCheck.status !== 0) return undefined;

    return new Promise<string | undefined>((resolve) => {
      const proc = spawn('cargo', ['install', 'metasearch'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      proc.stdout?.resume();
      proc.stderr?.resume();

      const timeout = setTimeout(() => {
        proc.kill('SIGTERM');
        resolve(undefined);
      }, CARGO_INSTALL_TIMEOUT_MS);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        resolve(code === 0 ? MetasearchService.resolveBin() : undefined);
      });

      proc.on('error', () => {
        clearTimeout(timeout);
        resolve(undefined);
      });
    });
  }

  // -----------------------------------------------------------------------
  // Config
  // -----------------------------------------------------------------------

  /** Ensure `config.toml` exists in the config directory. */
  private ensureConfig(): void {
    const configPath = path.join(this.configDir, 'config.toml');
    if (fs.existsSync(configPath)) return;
    fs.mkdirSync(this.configDir, { recursive: true });
    fs.writeFileSync(
      configPath,
      [
        '# Auto-generated by opencode-metasearch2',
        `api = true`,
        `bind = "0.0.0.0:${this.port}"`,
        '',
        '[image_search]',
        'enabled = true',
        '',
      ].join('\n'),
    );
  }

  // -----------------------------------------------------------------------
  // Process lifecycle
  // -----------------------------------------------------------------------

  /**
   * Spawn the metasearch2 process, wait until it is healthy, and register
   * cleanup handlers so the child is terminated when the parent exits.
   *
   * Throws if no binary was found or if the process does not become ready
   * within `startupTimeoutMs`.
   */
  async start(): Promise<void> {
    if (this.child) return; // already running

    if (!this.binPath && this.autoInstall) {
      this.binPath = await this.installViaCargo();
    }

    if (!this.binPath) {
      throw new Error(
        'binary not found. Install with: cargo install metasearch\n' +
          '  Or set METASEARCH_BIN to the binary path.',
      );
    }

    this.ensureConfig();

    this.child = spawn(this.binPath, [], {
      env: { ...process.env, XDG_CONFIG_HOME: path.dirname(this.configDir) },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    this.child.stdout?.resume();
    this.child.stderr?.resume();

    const cleanup = () => this.stop();
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    this.cleanupHandlers = [cleanup];

    await this.waitForReady();
  }

  /** Kill the child process if it is still running and remove signal handlers. */
  stop(): void {
    if (this.child && !this.child.killed) {
      this.child.kill('SIGTERM');
    }
    this.child = undefined;

    for (const handler of this.cleanupHandlers) {
      process.removeListener('exit', handler);
      process.removeListener('SIGINT', handler);
      process.removeListener('SIGTERM', handler);
    }
    this.cleanupHandlers = [];
  }

  /** Returns `true` when the child process is running and responding. */
  async isReady(): Promise<boolean> {
    if (!this.child || this.child.killed) return false;
    try {
      const res = await fetch(`${this.url}/search?q=ping`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(1000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Poll the health endpoint until the process is ready or a timeout fires. */
  private async waitForReady(): Promise<void> {
    const deadline = Date.now() + this.startupTimeoutMs;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${this.url}/search?q=ping`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(1000),
        });
        if (res.ok) return;
      } catch {
        // not ready yet
      }
      await new Promise((r) => setTimeout(r, this.healthPollIntervalMs));
    }
    throw new Error(`metasearch2 did not become ready within ${this.startupTimeoutMs}ms`);
  }

  // -----------------------------------------------------------------------
  // Search
  // -----------------------------------------------------------------------

  /** Execute a search and return the raw JSON response as a string. */
  async search(query: string, type: SearchType = 'all'): Promise<string> {
    const params = new URLSearchParams({ q: query });
    if (type === 'images') params.set('tab', 'images');

    const response = await fetch(`${this.url}/search?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`metasearch request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return JSON.stringify(data);
  }
}
