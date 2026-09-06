import {and, eq, isNull} from "drizzle-orm";
import {db} from "@/db";
import {feedbackReports} from "@/db/schema";
import {ensureUser} from "@/lib/server/ensureUser";
import {parseFeedbackUserEdit} from "@/lib/feedbackUserEdit";
import {deleteFeedbackImage} from "@/lib/server/feedbackImageStorage";

type Context = {params: Promise<{id: string}>};
function editableCondition(id: number, userId: string) {
  return and(
    eq(feedbackReports.id, id),
    eq(feedbackReports.userId, userId),
    eq(feedbackReports.status, "open"),
    isNull(feedbackReports.reviewedAt),
    isNull(feedbackReports.repliedAt),
    isNull(feedbackReports.adminReply),
  );
}
function unavailable() {
  return Response.json({ok:false,error:"not_editable"}, {status:409});
}

export async function PATCH(req: Request, context: Context) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ok:false,error:"unauthorized"}, {status:401});
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ok:false,error:"bad_id"}, {status:400});
  const parsed = parseFeedbackUserEdit(await req.json().catch(() => null));
  if (!parsed.ok) return Response.json({ok:false,error:parsed.error}, {status:400});
  // 조건부 UPDATE로 관리자 확인과 경합해도 확인된 건의는 변경하지 않는다.
  const [entry] = await db.update(feedbackReports).set(parsed.value)
    .where(editableCondition(id, userId)).returning({id:feedbackReports.id});
  return entry ? Response.json({ok:true,id:entry.id}) : unavailable();
}

export async function DELETE(_req: Request, context: Context) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ok:false,error:"unauthorized"}, {status:401});
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ok:false,error:"bad_id"}, {status:400});
  const [entry] = await db.delete(feedbackReports).where(editableCondition(id, userId))
    .returning({id:feedbackReports.id,imageKey:feedbackReports.imageKey});
  if (!entry) return unavailable();
  if (entry.imageKey) {
    try { await deleteFeedbackImage(entry.imageKey); }
    catch (error) { console.error("deleted feedback image cleanup failed", error); }
  }
  return Response.json({ok:true,id:entry.id});
}
