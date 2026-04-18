import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PROJECT_ROOT = path.resolve(__dirname, "..");
export const DATA_DIR = path.join(PROJECT_ROOT, "data");
export const BACKUP_DIR = path.join(PROJECT_ROOT, "backups");
export const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
export const RUNTIME_DIR = path.join(PROJECT_ROOT, "runtime");
export const REGISTRY_FILE = path.join(DATA_DIR, "registry.json");
export const UPDATE_STATE_FILE = path.join(DATA_DIR, "update-state.json");
export const PID_FILE = path.join(RUNTIME_DIR, "agentstage.pid.json");
export const LOG_FILE = path.join(RUNTIME_DIR, "agentstage.log");
export const DEFAULT_PORT = 4318;
export const DEFAULT_HOST = "127.0.0.1";
export const PROJECT_ROOT_TOKEN = "__PROJECT_ROOT__";
