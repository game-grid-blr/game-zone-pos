import { NextResponse } from "next/server";
import { z } from "zod";
import { login } from "@/lib/auth";
import { jsonError } from "@/lib/api";

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const body = schema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json({ error: "Enter username and password" }, { status: 400 });
    }

    const user = await login(body.data.username, body.data.password, {
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? undefined,
      userAgent: request.headers.get("user-agent") ?? undefined
    });
    if (!user) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    return jsonError(error);
  }
}
