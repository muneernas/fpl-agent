import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const password = process.env.EDGE_PASSWORD;
  if (!password) {
    return NextResponse.json(
      { error: "Set EDGE_PASSWORD in the environment first." },
      { status: 500 },
    );
  }
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  if (body.password !== password) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("edge_auth", password, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
