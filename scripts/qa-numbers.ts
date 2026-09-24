import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma as db } from "../src/lib/db";
import { selectOutboundNumber } from "../src/lib/numbers/selection";
import { numberConfig,telnyxNumberProvider,type NumberProvider,type NumberOffer,type ProviderOrder,type OwnedNumber } from "../src/lib/numbers/providers";
import { createNumberQuote,confirmNumberPurchase,reconcileNumberOrder,syncNumbers,saveNumberPolicy,checkNumberConnection } from "../src/lib/numbers/service";
import { startSession } from "../src/lib/dialer/session";
import { claimNextLead } from "../src/lib/dialer/queue";
import { startCall } from "../src/lib/dialer/calls";
import { handleInboundInitiated } from "../src/lib/dialer/inbound";

async function main(){
 if(process.env.QA_LOCAL!=="1"||process.env.TELEPHONY_PROVIDER!=="mock"||new URL(process.env.DATABASE_URL!).hostname!=="127.0.0.1")throw new Error("Local mock QA only");
 const tag=crypto.randomUUID(),rows:{id:string;name:string;status:string;error?:string}[]=[];
 const b=await db.business.create({data:{slug:`numbers-${tag}`,name:"QA numbers",settings:{maxDialsPerMinute:0}}});
 const other=await db.business.create({data:{slug:`numbers-other-${tag}`,name:"Other QA"}});
 const hash=await bcrypt.hash("qa-numbers-password",4);
 const admin=await db.user.create({data:{businessId:b.id,fullName:"QA numbers admin",email:`admin-${tag}@qa.local`,passwordHash:hash,role:"admin"}});
 const agents=await Promise.all(Array.from({length:6},(_,i)=>db.user.create({data:{businessId:b.id,fullName:`QA agent ${i}`,email:`agent${i}-${tag}@qa.local`,passwordHash:hash,role:"agent",sipUsername:`qa-${i}`}})));
 const foreign=await db.user.create({data:{businessId:other.id,fullName:"Other",email:`other-${tag}@qa.local`,passwordHash:hash,role:"admin"}});
 const numbers=await Promise.all([0,1,2].map(i=>db.phoneNumber.create({data:{businessId:b.id,e164:`+97239996${String(Date.now()%1000).padStart(3,"0")}${i}`,provider:"mock",isDefault:i===0,maxConcurrent:1}})));
 const list=await db.dialList.create({data:{businessId:b.id,name:"QA rotation",numberPolicy:{mode:"round_robin",numberIds:numbers.map(n=>n.id)}}});
 const req=async(user:typeof admin)=>{
   const r=await fetch(process.env.QA_BASE+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:user.email,password:"qa-numbers-password"})});assert.equal(r.status,200);const cookie=r.headers.get("set-cookie")!.split(";")[0];
   return async(body?:unknown,query="")=>{const r=await fetch(process.env.QA_BASE+"/api/numbers"+query,{method:body?"POST":"GET",headers:{cookie,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});return {status:r.status,json:await r.json()};};
 };
 const api=await req(admin),agentApi=await req(agents[0]),foreignApi=await req(foreign);
 async function test(id:string,name:string,fn:()=>Promise<void>){try{await fn();rows.push({id,name,status:"עבר"});console.log("PASS",id,name);}catch(e){rows.push({id,name,status:"נכשל",error:(e as Error).message});console.log("FAIL",id,name,(e as Error).message);}}
 const endCalls=()=>db.call.updateMany({where:{businessId:b.id},data:{endedAt:new Date(),activeForUser:null,outcomeSavedAt:new Date()}});
 const reserve=async(i:number,to:string,simulation=true)=>db.$transaction(async tx=>{const s=await selectOutboundNumber(tx,{businessId:b.id,userId:agents[i].id,listId:list.id,toE164:to,simulation});await tx.call.create({data:{businessId:b.id,userId:agents[i].id,mode:"manual",provider:"mock",idempotencyKey:crypto.randomUUID(),toE164:to,fromE164:s.number.e164,phoneNumberId:s.number.id,numberSelectionReason:s.reason,activeForUser:agents[i].id}});return s;});
 await test("NUM1","Agent cannot manage numbers and another tenant cannot mutate them",async()=>{assert.equal((await agentApi()).status,403);assert.equal((await foreignApi({action:"number",id:numbers[0].id,outboundPaused:true})).status,404);assert.equal((await api({action:"number",id:numbers[0].id,assignedUserId:foreign.id})).status,400);});
 await test("NUM2","Configuration alone never claims verified connection; no credentials in response",async()=>{const r=await api();assert.equal(r.status,200);assert.notEqual(r.json.data.provider.status,"verified");assert.equal(r.json.data.reputation.status,"unsupported");assert.ok(!JSON.stringify(r.json).includes("apiKey"));assert.equal((await api(undefined,"?days=999")).status,400);});
 await test("NUM3","Three parallel reservations use three numbers and respect concurrent cap",async()=>{const picks=await Promise.all([0,1,2].map(i=>reserve(i,`+97252910000${i}`)));assert.equal(new Set(picks.map(p=>p.number.id)).size,3);await assert.rejects(reserve(3,"+972529100009"),/אין מספר/);await endCalls();});
 await test("NUM4","Lead retains its prior caller ID",async()=>{const s=await reserve(0,"+972529100001");assert.equal(s.reason,"sticky_lead");const records=await db.call.findMany({where:{businessId:b.id,toE164:"+972529100001"}});assert.equal(new Set(records.map(c=>c.phoneNumberId)).size,1);await endCalls();});
 await test("NUM5","Paused, inactive and daily exhausted numbers are skipped",async()=>{await db.phoneNumber.update({where:{id:numbers[0].id},data:{outboundPaused:true}});await db.phoneNumber.update({where:{id:numbers[1].id},data:{isActive:false}});await db.phoneNumber.update({where:{id:numbers[2].id},data:{maxDailyAttempts:1}});await assert.rejects(reserve(0,"+972529100010"),/אין מספר/);await db.phoneNumber.updateMany({where:{businessId:b.id},data:{outboundPaused:false,isActive:true,maxDailyAttempts:null}});});
 await test("NUM6","Fixed campaign cannot silently replace an unavailable number",async()=>{await saveNumberPolicy(admin,list.id,{mode:"fixed",numberIds:[numbers[0].id]});await db.phoneNumber.update({where:{id:numbers[0].id},data:{outboundPaused:true}});await assert.rejects(reserve(0,"+972529100011"),/אין מספר/);await db.phoneNumber.update({where:{id:numbers[0].id},data:{outboundPaused:false}});});
 await test("NUM7","Agent-specific policy and load policy choose eligible assignments",async()=>{await db.phoneNumber.update({where:{id:numbers[1].id},data:{assignedUserId:agents[0].id}});await saveNumberPolicy(admin,list.id,{mode:"agent",numberIds:numbers.map(n=>n.id)});assert.equal((await reserve(0,"+972529100012")).number.id,numbers[1].id);await assert.rejects(reserve(1,"+972529100013"),/אין מספר/);await endCalls();await saveNumberPolicy(admin,list.id,{mode:"load",numberIds:numbers.map(n=>n.id)});const picks=await Promise.all([0,1].map(i=>reserve(i,`+97252910002${i}`)));assert.notEqual(picks[0].number.id,picks[1].number.id);await endCalls();});
 await test("NUM8","Spam-marked prior number blocks automatic replacement for that lead",async()=>{const prior=await db.call.findFirstOrThrow({where:{businessId:b.id,toE164:"+972529100001"},orderBy:{createdAt:"desc"}});await db.phoneNumber.update({where:{id:prior.phoneNumberId!},data:{outboundPaused:true,reputationStatus:"spam",reputationReview:"required"}});await assert.rejects(reserve(0,"+972529100001"),/ספאם/);await db.phoneNumber.update({where:{id:prior.phoneNumberId!},data:{outboundPaused:false,reputationStatus:"unsupported",reputationReview:null}});});
 await test("NUM9","DNC applies across all outbound numbers",async()=>{await db.dncEntry.create({data:{businessId:b.id,phoneE164:"+972529100099"}});for(const n of numbers)await assert.rejects(startCall(agents[0],{mode:"manual",phone:"0529100099",phoneNumberId:n.id,idempotencyKey:crypto.randomUUID()}),/חסום/);});
 await test("NUM10","No verified ownership or stale verification cannot place a real call",async()=>{await assert.rejects(reserve(0,"+972529100033",false),/לאמת/);});
 await test("NUM11","Outbound pause preserves callback routing to the previous agent",async()=>{const prior=await db.call.findFirstOrThrow({where:{businessId:b.id,toE164:"+972529100001"},orderBy:{createdAt:"desc"}});await db.phoneNumber.update({where:{id:prior.phoneNumberId!},data:{outboundPaused:true}});await db.user.update({where:{id:prior.userId},data:{presence:"available",lastSeenAt:new Date()}});await db.dialerSession.create({data:{businessId:b.id,userId:prior.userId,mode:"manual",browserSessionId:"qa-numbers-callback",status:"active"}});const c=await handleInboundInitiated({provider:"mock",eventId:crypto.randomUUID(),type:"leg.initiated",legId:`mock-inbound-${crypto.randomUUID()}`,direction:"incoming",from:"+972529100001",to:prior.fromE164,raw:{test:true}});assert.equal(c?.userId,prior.userId);assert.equal(c?.routingNote,"routed_to_previous_or_assigned_agent");await endCalls();await db.phoneNumber.updateMany({where:{businessId:b.id},data:{outboundPaused:false}});});
 const inventory:OwnedNumber[]=[],remote:ProviderOrder[]=[];let purchases=0,failPurchase=false,failConfig=false,failInventory=false;
 const offer:NumberOffer={e164:`+1212${String(Date.now()%10000000).padStart(7,"0")}`,country:"US",type:"local",upfront:"1.00",monthly:"2.00",currency:"USD",requirements:null,source:"QA simulation"};
 process.env.TELNYX_CALL_CONTROL_APP_ID="qa-number-connection";
 const provider:NumberProvider={name:"mock",async test(){return {channelLimit:5};},async search(){return [{...offer}];},async inventory(){if(failInventory)throw new Error("inventory timeout");return inventory.map(n=>({...n}));},async purchase(e164,reference){purchases++;const o={id:crypto.randomUUID(),status:"success",reference,numbers:[e164]};remote.push(o);inventory.push({id:crypto.randomUUID(),e164,status:"active",connectionId:null});if(failPurchase)throw new Error("unknown response");return o;},async findOrders(ref){return remote.filter(o=>o.reference===ref);},async configure(id){if(failConfig)throw new Error("setup failed");inventory.find(n=>n.id===id)!.connectionId=process.env.TELNYX_CALL_CONTROL_APP_ID!;}};
 await test("NUM12","Purchase requires explicit admin confirmation",async()=>{const q=await createNumberQuote(admin,offer,provider);await assert.rejects(confirmNumberPurchase(admin,q.id,false,provider),/אישור/);await assert.rejects(confirmNumberPurchase(agents[0],q.id,true,provider));assert.equal(purchases,0);});
 await test("NUM13","Concurrent purchase clicks charge once; ambiguous success is reconciled",async()=>{const q=await createNumberQuote(admin,offer,provider);failPurchase=true;await Promise.all(Array.from({length:5},()=>confirmNumberPurchase(admin,q.id,true,provider)));assert.equal(purchases,1);const ready=await reconcileNumberOrder(admin,q.id,provider);assert.equal(ready.state,"ready");assert.equal(await db.phoneNumber.count({where:{businessId:b.id,e164:offer.e164}}),1);failPurchase=false;});
 await test("NUM14","Purchase success plus setup failure stays out of dial pool; retry never buys twice",async()=>{offer.e164=offer.e164.slice(0,-2)+"82";failConfig=true;const q=await createNumberQuote(admin,offer,provider);const pending=await confirmNumberPurchase(admin,q.id,true,provider);assert.equal(pending.state,"configuring");assert.equal(await db.phoneNumber.count({where:{businessId:b.id,e164:offer.e164}}),0);const count=purchases;failConfig=false;assert.equal((await reconcileNumberOrder(admin,q.id,provider)).state,"ready");assert.equal(purchases,count);});
 await test("NUM15","Stale or changed price quotes cannot charge",async()=>{offer.e164=offer.e164.slice(0,-2)+"83";const q=await createNumberQuote(admin,offer,provider);const count=purchases;await db.numberOrder.update({where:{id:q.id},data:{expiresAt:new Date(0)}});await assert.rejects(confirmNumberPurchase(admin,q.id,true,provider),/פגה/);await createNumberQuote(admin,offer,provider);offer.monthly="3.00";await assert.rejects(confirmNumberPurchase(admin,q.id,true,provider),/השתנו/);assert.equal(purchases,count);});
 await test("NUM16","Missing remote order after timeout does not authorize another purchase",async()=>{offer.e164=offer.e164.slice(0,-2)+"84";const q=await createNumberQuote(admin,offer,provider);await db.numberOrder.update({where:{id:q.id},data:{state:"unknown"}});const count=purchases;assert.equal((await confirmNumberPurchase(admin,q.id,true,provider)).state,"unknown");assert.equal(purchases,count);});
 await test("NUM17","Failed inventory sync marks connection failed and preserves numbers/history",async()=>{failInventory=true;const before=await db.phoneNumber.count({where:{businessId:b.id}});await assert.rejects(syncNumbers(b.id,provider));assert.equal((await db.numberConnection.findUniqueOrThrow({where:{businessId:b.id}})).status,"failed");assert.equal(await db.phoneNumber.count({where:{businessId:b.id}}),before);failInventory=false;});
 await test("NUM18","Secrets stay server-side, provider 429 is visible, test flag blocks real purchase",async()=>{process.env.TELNYX_NUMBERS_BUSINESS_ID=b.id;process.env.TELNYX_API_KEY="qa-number-secret-not-real";process.env.NUMBER_PURCHASES_ENABLED="true";assert.equal(numberConfig(b.id).purchasesEnabled,false);assert.equal(numberConfig(other.id).configured,false);const telnyx=telnyxNumberProvider(b.id,async()=>new Response("{}",{status:429}));await assert.rejects(telnyx.search("US","local"),(e:unknown)=>e instanceof Error&&e.message.includes("קצב"));await assert.rejects(checkNumberConnection(b.id,telnyx));assert.equal((await db.numberConnection.findUniqueOrThrow({where:{businessId:b.id}})).status,"failed");});
 await test("NUM19","Manual reputation report is distinct from API check and persists",async()=>{assert.equal((await api({action:"reputation_manual",id:numbers[0].id,status:"spam",note:"QA manual Truecaller check"})).status,200);const r=await api({action:"reputation_check",id:numbers[0].id});assert.equal(r.json.data.status,"unsupported");const n=await db.phoneNumber.findUniqueOrThrow({where:{id:numbers[0].id}});assert.equal(n.reputationSource,"manual_truecaller");assert.equal(n.reputationStatus,"spam");assert.ok(n.reputationCheckedAt);});
 await test("NUM20","Server throttles management API requests",async()=>{let limited=false;for(let i=0;i<22;i++){const r=await api({action:"reputation_check",id:numbers[0].id});if(r.status===429){limited=true;break;}}assert.ok(limited);});
 await test("NUM21","Fresh provider connection and fresh number verification are both required",async()=>{
   await db.numberConnection.update({where:{businessId:b.id},data:{status:"verified",fingerprint:numberConfig(b.id).fingerprint,checkedAt:new Date()}});
   await db.phoneNumber.updateMany({where:{id:{in:numbers.map(n=>n.id)}},data:{provider:"telnyx",verificationStatus:"verified",verifiedAt:new Date(0),reputationStatus:"unsupported",reputationReview:null}});
   await assert.rejects(reserve(0,"+972529100077",false),/אין מספר/);
   await db.phoneNumber.updateMany({where:{id:{in:numbers.map(n=>n.id)}},data:{verifiedAt:new Date()}});
   const s=await reserve(0,"+972529100077",false);assert.ok(numbers.some(n=>n.id===s.number.id));await endCalls();
   await db.numberConnection.update({where:{businessId:b.id},data:{checkedAt:new Date(0)}});
   await assert.rejects(reserve(0,"+972529100078",false),/לאמת/);
 });
 await test("NUM22","Telnyx adapter checks app, enabled outbound profile, inventory and documented prices",async()=>{
   let profileEnabled=true;const seen:string[]=[];
   const adapter=telnyxNumberProvider(b.id,async(url,init)=>{
     assert.equal((init!.headers as Record<string,string>).Authorization,"Bearer qa-number-secret-not-real");
     const path=new URL(String(url)).pathname;seen.push(path);
     const data=path.includes("call_control_applications")?{active:true,outbound:{outbound_voice_profile_id:"qa-profile",channel_limit:10}}:path.includes("outbound_voice_profiles")?{enabled:profileEnabled,concurrent_call_limit:4}:path.includes("available_phone_numbers")?[{phone_number:"+12125550123",cost_information:{upfront_cost:"2.00",monthly_cost:"3.00",currency:"USD"}}]:[];
     return Response.json({data});
   });
   assert.equal((await adapter.test()).channelLimit,4);assert.ok(seen.some(p=>p.includes("outbound_voice_profiles")));
   const result=await adapter.search("US","local");assert.equal(result[0].monthly,"3.00");assert.equal(result[0].requirements,null);
   profileEnabled=false;await assert.rejects(adapter.test(),/מושבת/);
 });
 await test("NUM23","Preview call creation atomically stores the selected caller ID and reason",async()=>{
   await db.business.update({where:{id:b.id},data:{settings:{maxDialsPerMinute:0,dialWindow:{start:"00:00",end:"23:59",days:[0,1,2,3,4,5,6],timezone:"UTC"}}}});
   await db.phoneNumber.updateMany({where:{id:{in:numbers.map(n=>n.id)}},data:{outboundPaused:false,isActive:true,reputationStatus:"unsupported"}});
   await saveNumberPolicy(admin,list.id,{mode:"round_robin",numberIds:numbers.map(n=>n.id)});
   for(let i=0;i<2;i++){
     await db.dialListAgent.create({data:{listId:list.id,userId:agents[i].id}});
     const c=await db.contact.create({data:{businessId:b.id,fullName:"QA integration",phoneE164:`+97252910006${i}`,phoneRaw:`052910006${i}`}});
     await db.listLead.create({data:{businessId:b.id,listId:list.id,contactId:c.id}});
   }
   const calls=await Promise.all([0,1].map(async i=>{
     const s=await startSession(agents[i],{mode:"preview",listId:list.id,browserSessionId:`qa-preview-number-${i}`});
     const lead=await claimNextLead(b.id,agents[i].id,list.id);assert.ok(lead);
     return startCall(agents[i],{mode:"preview",sessionId:s.id,browserSessionId:s.browserSessionId,leadId:lead.id,lockToken:lead.lockToken!,idempotencyKey:crypto.randomUUID()});
   }));
   assert.equal(new Set(calls.map(c=>c.phoneNumberId)).size,2);
   for(const c of calls){assert.equal(c.numberSelectionReason,"round_robin");assert.equal(c.fromE164,numbers.find(n=>n.id===c.phoneNumberId)?.e164);}
   await endCalls();
 });
 await test("NUM24","Concurrent agents cannot exceed a daily number limit",async()=>{
   const used=await db.call.count({where:{businessId:b.id,phoneNumberId:numbers[0].id,direction:"outbound"}});
   await db.phoneNumber.update({where:{id:numbers[0].id},data:{maxDailyAttempts:used+1,maxConcurrent:null}});
   await saveNumberPolicy(admin,list.id,{mode:"round_robin",numberIds:[numbers[0].id]});
   const attempts=await Promise.allSettled([0,1].map(i=>reserve(i,`+97252910007${i}`)));
   assert.equal(attempts.filter(r=>r.status==="fulfilled").length,1);assert.equal(attempts.filter(r=>r.status==="rejected").length,1);await endCalls();
   await db.phoneNumber.update({where:{id:numbers[0].id},data:{maxDailyAttempts:null,maxConcurrent:1}});
 });
 await endCalls();
 fs.writeFileSync(".qa-local/numbers-results.json",JSON.stringify({at:new Date().toISOString(),mode:"local PostgreSQL, HTTP APIs, injected provider; no purchases or external calls",rows},null,2));
 fs.writeFileSync(".qa-local/numbers-fixture.json",JSON.stringify({email:admin.email,password:"qa-numbers-password",businessId:b.id,numbers:numbers.map(n=>n.id),listId:list.id}));
 await db.$disconnect();process.exitCode=rows.some(r=>r.status!=="עבר")?1:0;
}
main().catch(async e=>{console.error(e);await db.$disconnect();process.exitCode=1;});
