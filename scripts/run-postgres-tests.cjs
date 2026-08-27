const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl || !/^postgres(?:ql)?:\/\//i.test(testDatabaseUrl)) {
  console.error("Set TEST_DATABASE_URL to a disposable PostgreSQL test database before running PostgreSQL tests.");
  process.exit(1);
}

if (process.env.ALLOW_DESTRUCTIVE_TEST_RESET !== "true") {
  console.error("Set ALLOW_DESTRUCTIVE_TEST_RESET=true to confirm the PostgreSQL test database may be wiped.");
  process.exit(1);
}

const env = {
  ...process.env,
  DATABASE_URL: testDatabaseUrl,
  DIRECT_URL: process.env.TEST_DIRECT_URL || testDatabaseUrl,
  AUTH_SECRET: process.env.AUTH_SECRET || "test-auth-secret-for-fort-game-zone-pos",
  FGZ_ALLOW_DB_RESET: "true"
};

const prismaBin = join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "prisma.cmd" : "prisma");

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env, shell: false });
  if (result.status !== 0) process.exit(result.status || 1);
}

run(prismaBin, ["generate", "--schema", "prisma/schema.prisma"]);
run(prismaBin, ["migrate", "deploy", "--schema", "prisma/schema.prisma"]);
run(process.execPath, ["--experimental-loader", "./scripts/ts-node-loader.mjs", "--test", "tests/session-service.node.test.mjs"]);
