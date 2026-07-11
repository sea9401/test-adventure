"use client";

import { useState } from "react";
import { FeedbackForm } from "./FeedbackForm";
import { FeedbackHistory } from "./FeedbackHistory";

export function FeedbackCenter() {
  const [refreshToken, setRefreshToken] = useState(0);
  return (
    <div className="space-y-4">
      <FeedbackForm onSent={() => setRefreshToken((value) => value + 1)} />
      <FeedbackHistory refreshToken={refreshToken} />
    </div>
  );
}
