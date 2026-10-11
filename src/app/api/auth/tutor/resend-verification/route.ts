import { NextRequest, NextResponse } from "next/server";
import { resendTutorSignupVerifyEmail } from "@/lib/admin-email-verify";
import { getRequestBaseUrlSafe } from "@/lib/public-url";

const OK = {
  ok: true as const,
  message: "If that email needs confirmation, we sent a new link. Check your inbox.",
};

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const email =
    typeof body === "object" &&
    body !== null &&
    "email" in body &&
    typeof (body as { email: unknown }).email === "string"
      ? (body as { email: string }).email
      : "";
  const returnTo =
    typeof body === "object" &&
    body !== null &&
    "returnTo" in body &&
    typeof (body as { returnTo: unknown }).returnTo === "string"
      ? (body as { returnTo: string }).returnTo
      : null;

  await resendTutorSignupVerifyEmail({
    email,
    baseUrl: getRequestBaseUrlSafe(req),
    returnTo,
  });

  return NextResponse.json(OK);
}
