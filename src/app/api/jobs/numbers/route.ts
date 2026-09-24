import { NextRequest, NextResponse } from "next/server";
import { syncNumbers } from "@/lib/numbers/service";
import { numberConfig } from "@/lib/numbers/providers";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest) {
  if(!process.env.CRON_SECRET||req.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:"unauthorized"},{status:401});
  const businessId=process.env.TELNYX_NUMBERS_BUSINESS_ID;
  if(!businessId||!numberConfig(businessId).configured)return NextResponse.json({inventory:"unconfigured",reputation:"unsupported"});
  try{return NextResponse.json({...await syncNumbers(businessId),reputation:"unsupported"});}
  catch{return NextResponse.json({inventory:"failed",reputation:"unsupported"},{status:502});}
}
