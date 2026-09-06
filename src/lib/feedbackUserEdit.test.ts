import {describe, it, expect} from "vitest";
import {canEditFeedback, parseFeedbackUserEdit} from "./feedbackUserEdit";

describe("미확인 건의 편집 정책", () => {
  const open = {status:"open", reviewedAt:null, repliedAt:null, adminReply:null};
  it("접수 상태만 허용하고 확인/답변 흔적이 있으면 거부한다", () => {
    expect(canEditFeedback(open)).toBe(true);
    for (const patch of [{status:"reviewed"}, {status:"resolved"}, {reviewedAt:"2026-09-06"}, {adminReply:"답변"}, {repliedAt:"2026-09-06"}]) expect(canEditFeedback({...open,...patch})).toBe(false);
  });
  it("내용과 분류를 검증하고 원문의 공백만 정리한다", () => {
    expect(parseFeedbackUserEdit({content:"  수정한 건의 내용  ",category:"bug"})).toEqual({ok:true,value:{content:"수정한 건의 내용",category:"bug"}});
    for(const body of [null, {}, {content:"짧음",category:"bug"}, {content:"a".repeat(1001),category:"bug"}, {content:"정상적인 내용",category:"admin"}]) expect(parseFeedbackUserEdit(body).ok).toBe(false);
  });
});
