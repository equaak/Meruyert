import { NextResponse } from "next/server";

export async function GET() {
  const hasOdata = !!process.env.ODATA_BASE;
  const hasOdataUser = !!process.env.ODATA_USER;
  const hasOdataPass = !!process.env.ODATA_PASS;
  const hasJwt = !!process.env.JWT_SECRET_KEY;

  return NextResponse.json({
    status: "ok",
    env: {
      odata_base: hasOdata,
      odata_user: hasOdataUser,
      odata_pass: hasOdataPass,
      jwt_secret: hasJwt,
    },
    timestamp: new Date().toISOString(),
  });
}
