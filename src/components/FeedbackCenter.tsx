"use client";

import { useEffect, useState } from "react";
import { FeedbackForm } from "./FeedbackForm";
import { FeedbackHistory } from "./FeedbackHistory";
import { SURFACE_CARD } from "./ui/surfaces";

type FeedbackTab = "write" | "history";

export function FeedbackCenter() {
  const [refreshToken, setRefreshToken] = useState(0);
  const [activeTab, setActiveTab] = useState<FeedbackTab>("write");

  useEffect(() => {
    const selectHashTab = () => {
      if (window.location.hash.startsWith("#feedback-")) {
        setActiveTab("history");
      }
    };
    selectHashTab();
    window.addEventListener("hashchange", selectHashTab);
    return () => window.removeEventListener("hashchange", selectHashTab);
  }, []);

  const tabs: { id: FeedbackTab; label: string }[] = [
    { id: "write", label: "건의 작성" },
    { id: "history", label: "내 건의 내역" },
  ];

  return (
    <div className="space-y-3">
      <div className={`${SURFACE_CARD} flex p-1`} role="tablist" aria-label="건의사항 메뉴">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`feedback-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`feedback-panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`h-9 flex-1 rounded-md px-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-sky-600 text-white shadow-sm"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        id="feedback-panel-write"
        role="tabpanel"
        aria-labelledby="feedback-tab-write"
        hidden={activeTab !== "write"}
      >
        <FeedbackForm
          onSent={() => {
            setRefreshToken((value) => value + 1);
            setActiveTab("history");
          }}
        />
      </div>
      <div
        id="feedback-panel-history"
        role="tabpanel"
        aria-labelledby="feedback-tab-history"
        hidden={activeTab !== "history"}
      >
        <FeedbackHistory refreshToken={refreshToken} />
      </div>
    </div>
  );
}
