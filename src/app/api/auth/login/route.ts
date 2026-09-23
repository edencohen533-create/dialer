import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { cookieMaxAge, cookieName, signSession } from "@/lib/auth";
import { fail, handleError } from "@/lib/response";
import { parseBody } from "@/lib/api";

export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await parseBody(req, schema);
    const user = await prisma.user.findFirst({ where: { email: email.toLowerCase().trim(), isActive: true } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return fail("אימייל או סיסמה שגויים", 401, undefined, "bad_credentials");
    }
    const session = { id: user.id, businessId: user.businessId, email: user.email, fullName: user.fullName, role: user.role, teamId: user.teamId };
    const token = await signSession(session);
    const res = NextResponse.json({ success: true, data: session });
    res.cookies.set(cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: cookieMaxAge,
      path: "/",
    });
    await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
    return res;
  } catch (err) {
    return handleError(err);
  }
}
