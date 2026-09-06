import {beforeEach, describe, expect, it, vi} from "vitest";
import {PgDialect} from "drizzle-orm/pg-core";
import type {SQL} from "drizzle-orm";
const mocks = vi.hoisted(() => ({userId:"owner" as string|null, rows:[] as Record<string,unknown>[], where:vi.fn(), set:vi.fn(), cleanup:vi.fn()}));
vi.mock("@/lib/server/ensureUser",()=>({ensureUser:async()=>mocks.userId}));
vi.mock("@/lib/server/feedbackImageStorage",()=>({deleteFeedbackImage:mocks.cleanup}));
vi.mock("@/db",()=>({db:{
  update:()=>({set:(value:unknown)=>{mocks.set(value);return {where:(condition:unknown)=>{mocks.where(condition);return {returning:async()=>mocks.rows};}};}}),
  delete:()=>({where:(condition:unknown)=>{mocks.where(condition);return {returning:async()=>mocks.rows};}}),
}}));
import {PATCH, DELETE} from "./route";
const ctx = {params:Promise.resolve({id:"587"})};
function request(method:string, body:unknown={content:"수정한 건의 내용",category:"suggestion"}) {return new Request("http://test/api/feedback/587",{method,body:JSON.stringify(body),headers:{"content-type":"application/json"}});}
beforeEach(()=>{vi.clearAllMocks();mocks.userId="owner";mocks.rows=[{id:587,imageKey:null}];});
describe("본인 미확인 건의 수정/삭제 API",()=>{
  it.each([PATCH,DELETE])("인증 없이는 변경하지 않는다",async(handler)=>{mocks.userId=null;expect((await handler(request(handler===PATCH?"PATCH":"DELETE"),ctx)).status).toBe(401);expect(mocks.where).not.toHaveBeenCalled();});
  it("수정 SQL 자체에 소유자와 미확인 조건을 포함하고 허용 필드만 저장한다",async()=>{
    const result=await PATCH(request("PATCH",{content:"수정한 건의 내용",category:"bug",status:"resolved",userId:"other"}),ctx);
    expect(result.status).toBe(200);
    expect(mocks.set).toHaveBeenCalledWith({content:"수정한 건의 내용",category:"bug"});
    const query=new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0] as SQL);
    expect(query.params).toEqual([587,"owner","open"]);
    for(const field of ["reviewed_at","replied_at","admin_reply"])expect(query.sql).toContain(`"${field}" is null`);
    expect(query.sql).toContain('"user_id" =');
  });
  it.each([PATCH,DELETE])("소유자가 다르거나 확인 처리가 먼저 끝나 조건에 맞는 행이 없으면 거부한다",async(handler)=>{mocks.rows=[];expect((await handler(request(handler===PATCH?"PATCH":"DELETE"),ctx)).status).toBe(409);expect(mocks.cleanup).not.toHaveBeenCalled();});
  it("삭제한 행의 첨부 이미지만 정리한다",async()=>{mocks.rows=[{id:587,imageKey:"feedback/a.webp"}];expect((await DELETE(request("DELETE"),ctx)).status).toBe(200);expect(mocks.cleanup).toHaveBeenCalledWith("feedback/a.webp");});
  it("유효하지 않은 내용은 DB를 변경하지 않는다",async()=>{expect((await PATCH(request("PATCH",{content:"짧음",category:"bug"}),ctx)).status).toBe(400);expect(mocks.set).not.toHaveBeenCalled();});
});
