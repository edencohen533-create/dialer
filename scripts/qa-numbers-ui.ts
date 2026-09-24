import {chromium} from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import {prisma as db} from "../src/lib/db";
async function main(){
 if(process.env.QA_LOCAL!=="1"||process.env.TELEPHONY_PROVIDER!=="mock")throw new Error("Local QA only");
 const fixture=JSON.parse(fs.readFileSync(".qa-local/numbers-fixture.json","utf8"));
 await db.auditLog.deleteMany({where:{businessId:fixture.businessId,action:"numbers.api_request"}});
 const browser=await chromium.launch({headless:true});const ctx=await browser.newContext({viewport:{width:1366,height:900}});const page=await ctx.newPage();const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 const rows:{name:string;status:string;detail?:unknown}[]=[];fs.mkdirSync(".qa-local/numbers-shots",{recursive:true});
 const test=async(name:string,fn:()=>Promise<unknown>)=>{try{const detail=await fn();rows.push({name,status:"עבר",detail});console.log("PASS",name);}catch(e){rows.push({name,status:"נכשל",detail:(e as Error).message});console.log("FAIL",name,(e as Error).message);await page.screenshot({path:".qa-local/numbers-shots/failure.png",fullPage:true});}};
 const base=process.env.QA_BASE!;
 const login=await ctx.request.post(base+"/api/auth/login",{data:{email:fixture.email,password:fixture.password}});assert.equal(login.status(),200);
 await ctx.request.post(base+"/api/numbers",{data:{action:"reputation_manual",id:fixture.numbers[0],status:"spam",note:"QA browser manual report"}});
 await page.goto(base+"/numbers");await page.getByRole("heading",{name:"ניהול מספרים יוצאים"}).waitFor();
 await test("Hebrew RTL management page, honest disconnected state and spam alert",async()=>{
   await page.getByText("החיבור אינו נתמך בתצורה הנוכחית",{exact:true}).waitFor();await page.getByText(/מספרים מסומנים כספאם ודורשים/).waitFor();
   assert.equal(await page.locator("html").getAttribute("dir"),"rtl");assert.ok(await page.getByRole("button",{name:"בדיקת חיבור",exact:true}).isDisabled());
   const width=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(width.scroll<=width.viewport);await page.screenshot({path:".qa-local/numbers-shots/management.png",fullPage:true});return width;
 });
 const n0=await db.phoneNumber.findUniqueOrThrow({where:{id:fixture.numbers[0]}});
 const row=page.locator("tbody tr").filter({hasText:n0.e164});
 await test("Pause persisted on server and survives reload",async()=>{await row.getByRole("button",{name:"השהה חיוג יוצא",exact:true}).click();await row.getByText("חיוג יוצא מושהה",{exact:true}).waitFor();assert.ok((await db.phoneNumber.findUniqueOrThrow({where:{id:fixture.numbers[0]}})).outboundPaused);await page.reload();await row.getByText("חיוג יוצא מושהה",{exact:true}).waitFor();});
 await test("Failed activation is shown and does not claim success",async()=>{await page.route("**/api/numbers",async route=>{if(route.request().method()==="POST"&&route.request().postDataJSON().action==="number")await route.fulfill({status:500,contentType:"application/json",body:JSON.stringify({error:"כשל שמירה בבדיקת QA"})});else await route.continue();});await row.getByRole("button",{name:"הפעל חיוג יוצא",exact:true}).click();await page.getByRole("alert").filter({hasText:"כשל שמירה בבדיקת QA"}).waitFor();assert.ok(await row.getByText("חיוג יוצא מושהה",{exact:true}).isVisible());await page.screenshot({path:".qa-local/numbers-shots/save-failure.png",fullPage:true});await page.unroute("**/api/numbers");await row.getByRole("button",{name:"הפעל חיוג יוצא",exact:true}).click();await row.getByRole("button",{name:"השהה חיוג יוצא",exact:true}).waitFor();});
 await test("Campaign policy saves and reloads",async()=>{await page.getByLabel("קמפיין",{exact:true}).selectOption(fixture.listId);await page.getByLabel("שיטת בחירה",{exact:true}).selectOption("round_robin");const checks=page.locator('input[type="checkbox"]');await checks.nth(0).check();await checks.nth(1).check();await page.getByRole("button",{name:"שמור מדיניות",exact:true}).click();await page.getByText("מדיניות הקמפיין נשמרה",{exact:true}).waitFor();const l=await db.dialList.findUniqueOrThrow({where:{id:fixture.listId}});assert.equal((l.numberPolicy as {mode:string}).mode,"round_robin");await page.reload();await page.getByLabel("קמפיין",{exact:true}).selectOption(fixture.listId);assert.equal(await page.getByLabel("שיטת בחירה").inputValue(),"round_robin");});
 await test("Purchase confirmation shows price and requires explicit approval (UI fixtures only)",async()=>{
   const offer={e164:"+12125550199",country:"US",type:"local",upfront:"1.00",monthly:"2.00",currency:"USD",requirements:null,source:"QA browser fixture"};let charged=0;
   await page.route("**/api/numbers**",async route=>{
     if(route.request().method()==="GET"){const r=await route.fetch();const j=await r.json();j.data.provider.configured=true;j.data.provider.purchasesEnabled=true;await route.fulfill({json:j});return;}
     const body=route.request().postDataJSON();
     if(body.action==="search")return route.fulfill({json:{success:true,data:[offer]}});
     if(body.action==="quote")return route.fulfill({json:{success:true,data:{id:"qa-ui-quote",e164:offer.e164,state:"quoted",quote:offer,expiresAt:new Date(Date.now()+300000).toISOString()}}});
     if(body.action==="purchase"){assert.equal(body.confirmed,true);charged++;return route.fulfill({json:{success:true,data:{state:"pending"}}});}
     await route.continue();
   });
   await page.reload();await page.getByRole("button",{name:"חפש מספרים זמינים",exact:true}).click();await page.getByRole("button",{name:"רכישת מספר",exact:true}).click();
   const confirm=page.getByRole("button",{name:"אישור רכישה בתשלום",exact:true});await confirm.waitFor();assert.ok(await confirm.isDisabled());await page.getByText("מחיר רכישה: 1.00 USD",{exact:true}).waitFor();await page.getByText("עלות חודשית: 2.00 USD",{exact:true}).waitFor();await page.getByLabel(/אני מאשר/).check();assert.ok(await confirm.isEnabled());await page.screenshot({path:".qa-local/numbers-shots/purchase-confirmation-ui-fixture.png",fullPage:true});await confirm.click();await page.getByText("אישור רכישת מספר",{exact:true}).waitFor({state:"hidden"});assert.equal(charged,1);await page.unroute("**/api/numbers**");return {interceptedPurchaseRequests:charged,realPurchases:0};
 });
 await browser.close();await db.$disconnect();fs.writeFileSync(".qa-local/numbers-ui-results.json",JSON.stringify({mode:"Chromium local mock; purchase dialog uses intercepted UI fixtures",rows,errors},null,2));process.exitCode=rows.some(r=>r.status!=="עבר")||errors.length?1:0;
}
main().catch(async e=>{console.error(e);await db.$disconnect();process.exitCode=1;});
