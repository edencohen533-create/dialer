import { createHash } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/lib/response";

export interface NumberOffer {
  e164: string; country: string; type: string; upfront: string | null; monthly: string | null;
  currency: string | null; requirements: unknown; source: string;
}
export interface OwnedNumber { id: string; e164: string; status: string; connectionId: string | null; }
export interface ProviderOrder { id: string; status: string; reference: string | null; numbers: string[]; }
export interface NumberProvider {
  name: string;
  test(): Promise<{ channelLimit: number | null }>;
  search(country: string, type: string, e164?: string): Promise<NumberOffer[]>;
  inventory(): Promise<OwnedNumber[]>;
  purchase(e164: string, reference: string): Promise<ProviderOrder>;
  findOrders(reference: string): Promise<ProviderOrder[]>;
  configure(id: string): Promise<void>;
}
export function numberConfig(businessId: string) {
  // The existing voice adapter uses one server account. Explicit tenant binding prevents
  // a second business from seeing/purchasing through that account accidentally.
  const configured = Boolean(process.env.TELNYX_NUMBERS_BUSINESS_ID === businessId && process.env.TELNYX_API_KEY && process.env.TELNYX_CALL_CONTROL_APP_ID);
  return { configured, fingerprint: configured ? createHash("sha256").update(`${process.env.TELNYX_API_KEY}:${process.env.TELNYX_CALL_CONTROL_APP_ID}`).digest("hex") : null,
    purchasesEnabled: configured && process.env.NUMBER_PURCHASES_ENABLED === "true" && process.env.QA_LOCAL !== "1" };
}
const numberSchema = z.object({ id: z.string(), phone_number: z.string(), status: z.string(), connection_id: z.string().nullable().optional() });
const orderSchema = z.object({ id: z.string(), status: z.string(), customer_reference: z.string().nullable().optional(), phone_numbers: z.array(z.object({ phone_number: z.string() })) });
function parseOrder(raw: unknown): ProviderOrder { const o=orderSchema.parse(raw);return {id:o.id,status:o.status,reference:o.customer_reference ?? null,numbers:o.phone_numbers.map(n=>n.phone_number)}; }

export function telnyxNumberProvider(businessId: string, transport: typeof fetch = fetch): NumberProvider {
  if (!numberConfig(businessId).configured) throw new ApiError("חיבור Telnyx לא הוגדר עבור העסק בשרת", 409, "number_provider_unconfigured");
  const connectionId = process.env.TELNYX_CALL_CONTROL_APP_ID!;
  async function request(path: string, method = "GET", body?: unknown): Promise<{data: unknown; meta?: {total_pages?: number}}> {
    let response: Response;
    try { response = await transport(`https://api.telnyx.com/v2${path}`, { method, headers:{Authorization:`Bearer ${process.env.TELNYX_API_KEY}`,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body), signal:AbortSignal.timeout(12000), cache:"no-store" }); }
    catch {throw new ApiError("לא התקבלה תשובה ודאית מספק המספרים",502,"provider_unknown");}
    if (!response.ok) throw new ApiError(response.status===429?"ספק המספרים מגביל את קצב הבקשות; נסה מאוחר יותר":"הבקשה לספק המספרים נכשלה",response.status===429?429:502,`provider_http_${response.status}`);
    try {const value=await response.json(); if (!value || !("data" in value)) throw new Error();return value;}
    catch {throw new ApiError("תשובת ספק לא תקינה; נדרש בירור מצב",502,"provider_unknown");}
  }
  async function pages(path: string): Promise<unknown[]> {
    const result:unknown[]=[];
    for(let page=1;page<=100;page++) {
      const r=await request(`${path}${path.includes("?")?"&":"?"}page[size]=100&page[number]=${page}`);
      if(!Array.isArray(r.data))throw new ApiError("תשובת ספק לא תקינה",502,"provider_unknown");
      result.push(...r.data);
      if(r.data.length<100 || (r.meta?.total_pages!==undefined && page>=r.meta.total_pages))return result;
    }
    throw new ApiError("מלאי גדול מדי לסנכרון אחד; יש לפנות למנהל",409,"inventory_incomplete");
  }
  return {
    name:"telnyx",
    async test() {
      const r=await request(`/call_control_applications/${encodeURIComponent(connectionId)}`);
      const app=z.object({active:z.boolean(),outbound:z.object({outbound_voice_profile_id:z.string().min(1),channel_limit:z.number().nullable().optional()})}).parse(r.data);
      if(!app.active)throw new ApiError("אפליקציית הטלפוניה אינה פעילה",409,"provider_not_ready");
      const rawProfile=await request(`/outbound_voice_profiles/${encodeURIComponent(app.outbound.outbound_voice_profile_id)}`);
      const profile=z.object({enabled:z.boolean(),concurrent_call_limit:z.number().nullable().optional()}).parse(rawProfile.data);
      if(!profile.enabled)throw new ApiError("פרופיל החיוג היוצא מושבת אצל הספק",409,"provider_not_ready");
      // Also prove account inventory access. Saving a key is never a successful check.
      await request("/phone_numbers?page[size]=1");
      const limits=[app.outbound.channel_limit,profile.concurrent_call_limit].filter((n):n is number=>typeof n==="number"&&n>0);
      return {channelLimit:limits.length?Math.min(...limits):null};
    },
    async search(country,type,e164) {
      const query=new URLSearchParams({"filter[country_code]":country,"filter[phone_number_type]":type,"filter[features]":"voice","filter[limit]":"20","filter[best_effort]":"false"});
      if(e164)query.set("filter[phone_number][contains]",e164.replace(/^\+/,""));
      const r=await request(`/available_phone_numbers?${query}`);
      const offers=z.array(z.object({phone_number:z.string(),cost_information:z.object({upfront_cost:z.string().optional(),monthly_cost:z.string().optional(),currency:z.string().optional()}).optional(),regulatory_requirements:z.unknown().optional()})).parse(r.data);
      return offers.filter(n=>!e164||n.phone_number===e164).map(n=>({e164:n.phone_number,country,type,upfront:n.cost_information?.upfront_cost??null,monthly:n.cost_information?.monthly_cost??null,currency:n.cost_information?.currency??null,requirements:n.regulatory_requirements??null,source:"Telnyx available_phone_numbers"}));
    },
    async inventory() {return (await pages("/phone_numbers")).map(raw=>{const n=numberSchema.parse(raw);return {id:n.id,e164:n.phone_number,status:n.status,connectionId:n.connection_id??null};});},
    async purchase(e164,reference) {return parseOrder((await request("/number_orders","POST",{phone_numbers:[{phone_number:e164}],connection_id:connectionId,customer_reference:reference})).data);},
    async findOrders(reference) {return (await pages(`/number_orders?${new URLSearchParams({"filter[customer_reference]":reference})}`)).map(parseOrder).filter(o=>o.reference===reference);},
    async configure(id) {await request(`/phone_numbers/${encodeURIComponent(id)}`,"PATCH",{connection_id:connectionId});},
  };
}
