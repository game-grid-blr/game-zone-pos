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

    await prisma.$transaction(async (tx) => {
      if (Object.keys(settingsInput).length) await updateSettings(settingsInput, tx);

      if (tables) {
        for (const tableInput of tables) {
          const table = tableInput.id
            ? await tx.gameTable.update({
                where: { id: tableInput.id },
                data: {
                  name: tableInput.name,
                  gameType: tableInput.gameType,
                  active: tableInput.active,
                  sortOrder: tableInput.sortOrder
                }
              })
            : await tx.gameTable.create({
                data: {
                  name: tableInput.name,
                  gameType: tableInput.gameType,
                  active: tableInput.active,
                  sortOrder: tableInput.sortOrder
                }
              });

          for (const price of tableInput.pricing) {
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
    });

    const [settings, updatedTables] = await Promise.all([
      getSettings(),
      prisma.gameTable.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { pricing: { orderBy: { durationMinutes: "asc" } } }
      })
    ]);
    return ok({ settings, tables: updatedTables });
  } catch (error) {
    return jsonError(error);
  }
}
