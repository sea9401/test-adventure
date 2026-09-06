// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,describe,expect,it,vi} from "vitest";
import {FeedbackEntryActions} from "./FeedbackEntryActions";
const entry={id:587,content:"원래 작성한 건의입니다.",category:"suggestion",status:"open",reviewedAt:null,repliedAt:null,adminReply:null};
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe("건의 수정·삭제 화면",()=>{
  it("수정 내용을 저장하고 목록 갱신을 요청한다",async()=>{
    const fetchMock=vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit)=>Response.json({ok:true}));vi.stubGlobal("fetch",fetchMock);
    const onChanged=vi.fn();render(<FeedbackEntryActions entry={entry} onChanged={onChanged}/>);
    fireEvent.click(screen.getByRole("button",{name:"수정"}));
    fireEvent.change(screen.getByLabelText("건의 내용 수정"),{target:{value:"변경한 내용입니다."}});
    fireEvent.change(screen.getByLabelText("건의 분류 수정"),{target:{value:"bug"}});
    fireEvent.click(screen.getByRole("button",{name:"저장"}));
    await waitFor(()=>expect(onChanged).toHaveBeenCalledWith(false));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({content:"변경한 내용입니다.",category:"bug"});
  });
  it("삭제는 확인을 눌러야 실행된다",async()=>{
    const fetchMock=vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit)=>Response.json({ok:true}));vi.stubGlobal("fetch",fetchMock);
    const onChanged=vi.fn();render(<FeedbackEntryActions entry={entry} onChanged={onChanged}/>);
    fireEvent.click(screen.getByRole("button",{name:"삭제"}));expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"취소"}));expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"삭제"}));fireEvent.click(screen.getByRole("button",{name:"삭제 확인"}));
    await waitFor(()=>expect(onChanged).toHaveBeenCalledWith(true));
    expect(fetchMock.mock.calls[0][1]?.method).toBe("DELETE");
  });
  it("관리자가 확인한 건의는 편집 버튼을 보여주지 않는다",()=>{
    render(<FeedbackEntryActions entry={{...entry,reviewedAt:"2026-09-06"}} onChanged={vi.fn()}/>);
    expect(screen.queryByRole("button",{name:"수정"})).toBeNull();
  });
  it("편집 중 확인된 경우 실패 이유를 보여주며 성공 처리하지 않는다",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>Response.json({ok:false,error:"not_editable"},{status:409})));
    const onChanged=vi.fn();render(<FeedbackEntryActions entry={entry} onChanged={onChanged}/>);
    fireEvent.click(screen.getByRole("button",{name:"수정"}));fireEvent.click(screen.getByRole("button",{name:"저장"}));
    expect((await screen.findByRole("alert")).textContent).toContain("관리자가 확인했거나");
    expect(onChanged).not.toHaveBeenCalled();expect(screen.queryByRole("button",{name:"저장"})).toBeNull();
  });
});
