import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser, jsonError, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getSettings, updateSettings } from "@/lib/settings";

const pricingSchema = z.object({
  id: z.string().optional(),
  durationMinutes: z.coerce.number().int().positive(),
  price: z.coerce.number().int().min(0),
  active: z.boolean().default(true)
});

const tableSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  gameType: z.string().min(1),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
  pricing: z.array(pricingSchema).default([])
});

const settingsSchema = z.object({
  businessName: z.string().min(1).optional(),
  businessAddress: z.string().optional(),
  businessPhone: z.string().optional(),
  currency: z.string().min(3).max(3).optional(),
  taxEnabled: z.boolean().optional(),
  taxRatePercent: z.coerce.number().min(0).max(100).optional(),
  durationOptions: z.array(z.number().int().positive()).optional(),
  warningTimeMinutes: z.coerce.number().int().min(1).optional(),
  paymentMethods: z.array(z.string()).optional(),
  receiptFooter: z.string().optional(),
  warningSound: z.string().optional(),
  expiryAlarm: z.string().optional(),
  alarmFrequency: z.coerce.number().int().positive().optional(),
  warningFrequency: z.coerce.number().int().positive().optional(),
  tables: z.array(tableSchema).optional()
});

type PricingInput = z.infer<typeof pricingSchema>;
type TableInput = z.infer<typeof tableSchema>;

type ExistingTable = {
  id: string;
  name: string;
  gameType: string;
  active: boolean;
  sortOrder: number;
  pricing: ExistingPrice[];
};

type ExistingPrice = {
  durationMinutes: number;
  price: number;
  active: boolean;
};

const SETTINGS_TRANSACTION_TIMEOUT_MS = 15_000;
const SETTINGS_TRANSACTION_MAX_WAIT_MS = 10_000;

function tableChanged(table: ExistingTable, input: TableInput) {
  return table.name !== input.name || table.gameType !== input.gameType || table.active !== input.active || table.sortOrder !== input.sortOrder;
}

function priceChanged(price: ExistingPrice | undefined, input: PricingInput) {
  return !price || price.price !== input.price || price.active !== input.active;
}

function redactSecrets(value: string) {
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "postgresql://<redacted>")
    .replace(/\b(DATABASE_URL|DIRECT_URL|AUTH_SECRET|password|passwordHash)\b\s*[:=]\s*["']?[^"',\s}]+/gi, "$1=<redacted>");
}

function redactForLog(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map((item) => redactForLog(item));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      /password|secret|url/i.test(key) ? "<redacted>" : redactForLog(item)
    ])
  );
}

function settingsErrorDetails(error: unknown) {
  if (error instanceof z.ZodError) {
    return {
      name: "ZodError",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
        message: issue.message
      }))
    };
  }

  if (error instanceof Error) {
    const details: Record<string, unknown> = {
      name: error.name,
      message: redactSecrets(error.message)
    };
    if (error.stack) details.stack = redactSecrets(error.stack);

    const prismaError = error as Error & { code?: unknown; meta?: unknown; clientVersion?: unknown };
    if (prismaError.code) details.code = prismaError.code;
    if (prismaError.meta) details.meta = redactForLog(prismaError.meta);
    if (prismaError.clientVersion) details.clientVersion = prismaError.clientVersion;
    return details;
  }

  return { error: redactForLog(error) };
}

function settingsJsonError(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "message" in error &&
    typeof error.status === "number" &&
    typeof error.message === "string"
  ) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error("PUT /api/settings failed", settingsErrorDetails(error));
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

export async function GET() {
  try {
    await apiUser();
    const [settings, tables] = await Promise.all([
      getSettings(),
      prisma.gameTable.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { pricing: { orderBy: { durationMinutes: "asc" } } }
      })
    ]);
    return ok({ settings, tables });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await apiUser(["ADMIN"]);
    const body = settingsSchema.parse(await request.json());
    const { tables, ...settingsInput } = body;

    await prisma.$transaction(
      async (tx) => {
        if (Object.keys(settingsInput).length) await updateSettings(settingsInput, tx);

        if (tables) {
          const existingTableIds = tables.map((table) => table.id).filter((id): id is string => Boolean(id));
          const existingTables = existingTableIds.length
            ? await tx.gameTable.findMany({
                where: { id: { in: existingTableIds } },
                select: {
                  id: true,
                  name: true,
                  gameType: true,
                  active: true,
                  sortOrder: true,
                  pricing: {
                    select: { durationMinutes: true, price: true, active: true }
                  }
                }
              })
            : [];
          const existingTableById = new Map(existingTables.map((table) => [table.id, table]));

          for (const tableInput of tables) {
            const existingTable = tableInput.id ? existingTableById.get(tableInput.id) : undefined;
            const table =
              tableInput.id && existingTable && !tableChanged(existingTable, tableInput)
                ? existingTable
                : tableInput.id
                  ? await tx.gameTable.update({
                      where: { id: tableInput.id },
                      data: {
                        name: tableInput.name,
                        gameType: tableInput.gameType,
                        active: tableInput.active,
                        sortOrder: tableInput.sortOrder
                      },
                      select: {
                        id: true,
                        name: true,
                        gameType: true,
                        active: true,
                        sortOrder: true,
                        pricing: {
                          select: { durationMinutes: true, price: true, active: true }
                        }
                      }
                    })
                  : await tx.gameTable.create({
                      data: {
                        name: tableInput.name,
                        gameType: tableInput.gameType,
                        active: tableInput.active,
                        sortOrder: tableInput.sortOrder
                      },
                      select: {
                        id: true,
                        name: true,
                        gameType: true,
                        active: true,
                        sortOrder: true,
                        pricing: {
                          select: { durationMinutes: true, price: true, active: true }
                        }
                      }
                    });

            const existingPriceByDuration = new Map((existingTable?.pricing ?? []).map((price) => [price.durationMinutes, price]));
            for (const price of tableInput.pricing) {
              if (tableInput.id && !priceChanged(existingPriceByDuration.get(price.durationMinutes), price)) continue;

              await tx.pricing.upsert({
                where: {
                  gameTableId_durationMinutes: {
                    gameTableId: table.id,
                    durationMinutes: price.durationMinutes
                  }
                },
                update: { price: price.price, active: price.active },
                create: {
                  gameTableId: table.id,
                  durationMinutes: price.durationMinutes,
                  price: price.price,
                  active: price.active
                }
              });
            }
          }
        }

        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "SETTINGS_UPDATED",
            entityType: "SETTINGS",
            entityId: "global",
            metadata: JSON.stringify({ settings: Object.keys(settingsInput), tables: tables?.length ?? 0 })
          }
        });
      },
      {
        maxWait: SETTINGS_TRANSACTION_MAX_WAIT_MS,
        timeout: SETTINGS_TRANSACTION_TIMEOUT_MS
      }
    );

    const [settings, updatedTables] = await Promise.all([
      getSettings(),
      prisma.gameTable.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { pricing: { orderBy: { durationMinutes: "asc" } } }
      })
    ]);
    return ok({ settings, tables: updatedTables });
  } catch (error) {
    return settingsJsonError(error);
  }
}
