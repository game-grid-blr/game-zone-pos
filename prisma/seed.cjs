const bcrypt = require("bcryptjs");
const { PrismaClient, TableStatus } = require("@prisma/client");

const prisma = new PrismaClient();

const settings = {
  businessName: "Fort Game Zone",
  businessAddress: "Indoor Games, Main Road",
  businessPhone: "+91 98765 43210",
  currency: "INR",
  taxEnabled: "false",
  taxRatePercent: "0",
  durationOptions: JSON.stringify([15, 30, 45, 60]),
  warningTimeMinutes: "5",
  paymentMethods: JSON.stringify(["CASH", "UPI", "CARD"]),
  receiptFooter: "Thanks for playing at Fort Game Zone",
  warningSound: "soft-beep",
  expiryAlarm: "loud-alarm",
  alarmFrequency: "880",
  warningFrequency: "520"
};

const priceMatrix = {
  "Pool Table 1": { 15: 10000, 30: 18000, 45: 25000, 60: 32000 },
  "Pool Table 2": { 15: 10000, 30: 18000, 45: 25000, 60: 32000 },
  Carrom: { 15: 5000, 30: 9000, 45: 13000, 60: 16000 }
};

function seedPassword(name) {
  const value = process.env[name]?.trim();
  if (value) return value;
  throw new Error(`${name} is required before seeding. Use a private value and do not commit it.`);
}

async function upsertTable(name, gameType, sortOrder) {
  const table = await prisma.gameTable.upsert({
    where: { id: `seed-${name.toLowerCase().replaceAll(" ", "-")}` },
    update: { name, gameType, active: true, sortOrder },
    create: {
      id: `seed-${name.toLowerCase().replaceAll(" ", "-")}`,
      name,
      gameType,
      sortOrder,
      status: TableStatus.AVAILABLE
    }
  });

  for (const [duration, price] of Object.entries(priceMatrix[name] || {})) {
    await prisma.pricing.upsert({
      where: {
        gameTableId_durationMinutes: {
          gameTableId: table.id,
          durationMinutes: Number(duration)
        }
      },
      update: { price, active: true },
      create: {
        gameTableId: table.id,
        durationMinutes: Number(duration),
        price
      }
    });
  }
}

async function main() {
  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      name: "Admin",
      username: "admin",
      passwordHash: await bcrypt.hash(seedPassword("SEED_ADMIN_PASSWORD"), 10),
      role: "ADMIN"
    }
  });

  await prisma.user.upsert({
    where: { username: "staff" },
    update: {},
    create: {
      name: "Staff",
      username: "staff",
      passwordHash: await bcrypt.hash(seedPassword("SEED_STAFF_PASSWORD"), 10),
      role: "STAFF"
    }
  });

  await upsertTable("Pool Table 1", "Pool", 1);
  await upsertTable("Pool Table 2", "Pool", 2);
  await upsertTable("Carrom", "Carrom", 3);

  for (const [key, value] of Object.entries(settings)) {
    await prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    prisma.$disconnect();
    process.exit(1);
  });
