const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

function parseEnvValue(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readDatabaseUrl() {
  const envPath = path.join(process.cwd(), ".env");
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = /^\s*DATABASE_URL\s*=\s*(.*)\s*$/.exec(line);
    if (match) return parseEnvValue(match[1]);
  }
  return "";
}

function redactError(error, databaseUrl) {
  let message = String(error?.message || error || "Connection test failed");
  if (databaseUrl) message = message.split(databaseUrl).join("[redacted-url]");
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, "[redacted-url]")
    .replace(/password=[^\s&]+/gi, "password=[redacted]")
    .replace(/db\.[a-z0-9]+\.supabase\.co/gi, "db.[project-ref].supabase.co");
}

async function main() {
  const databaseUrl = readDatabaseUrl();
  if (!databaseUrl) {
    console.error("DATABASE_URL is missing from .env");
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: [] });
  try {
    const result = await prisma.$queryRawUnsafe("SELECT 1 AS ok");
    if (Array.isArray(result) && Number(result[0]?.ok) === 1) {
      console.log("PASS");
    } else {
      console.error("SELECT 1 returned an unexpected result");
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(redactError(error, databaseUrl));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(redactError(error, ""));
  process.exitCode = 1;
});
