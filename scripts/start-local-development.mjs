import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";

const projectRoot = process.cwd();
const localRoot = join(homedir(), ".local");
const postgresRoot = join(localRoot, "opt", "adventure-postgresql-16");
const postgresBin = join(
  postgresRoot,
  "usr",
  "lib",
  "postgresql",
  "16",
  "bin",
);
const pgCtl = join(postgresBin, "pg_ctl");
const dataDirectory = join(
  localRoot,
  "share",
  "adventure-rpg",
  "postgres",
);
const socketDirectory = join(
  localRoot,
  "share",
  "adventure-rpg",
  "socket",
);
const logFile = join(localRoot, "share", "adventure-rpg", "postgres.log");
const envFile = join(projectRoot, ".env.development.local");

for (const required of [pgCtl, dataDirectory, socketDirectory, envFile]) {
  if (!existsSync(required)) {
    console.error(`로컬 개발 설정이 없습니다: ${required}`);
    process.exit(1);
  }
}

function postgresIsRunning() {
  try {
    execFileSync(pgCtl, ["-D", dataDirectory, "status"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

let startedPostgres = false;
if (!postgresIsRunning()) {
  console.log("로컬 PostgreSQL을 시작합니다.");
  execFileSync(
    pgCtl,
    [
      "-D",
      dataDirectory,
      "-l",
      logFile,
      "-o",
      `-c listen_addresses=127.0.0.1 -c unix_socket_directories=${socketDirectory} -p 5432`,
      "start",
    ],
    { stdio: "inherit" },
  );
  startedPostgres = true;
}

function stopPostgres() {
  if (!startedPostgres) return;
  console.log("로컬 PostgreSQL을 종료합니다.");
  try {
    execFileSync(pgCtl, ["-D", dataDirectory, "-m", "fast", "stop"], {
      stdio: "inherit",
    });
  } catch (error) {
    console.error("로컬 PostgreSQL 종료에 실패했습니다.", error);
  }
}

try {
  execFileSync(
    process.execPath,
    ["--env-file=.env.development.local", "src/db/migrate.mjs"],
    { cwd: projectRoot, stdio: "inherit" },
  );

  console.log("로컬 관리자 계정으로 게임을 시작합니다: http://localhost:3000");
  const developmentServer = spawn("npm", ["run", "dev"], {
    cwd: projectRoot,
    stdio: "inherit",
  });
  let requestedShutdown = false;
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      requestedShutdown = true;
      developmentServer.kill(signal);
    });
  }
  const [code, signal] = await once(developmentServer, "exit");
  if (requestedShutdown) process.exitCode = 0;
  else if (signal) process.exitCode = 1;
  else process.exitCode = code ?? 1;
} finally {
  stopPostgres();
}
