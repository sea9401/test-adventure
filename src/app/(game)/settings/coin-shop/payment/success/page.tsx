import { Suspense } from "react";
import { PaymentResultView } from "../PaymentResultView";

export default function MuseunCoinPaymentSuccessPage() {
  return <Suspense fallback={null}><PaymentResultView mode="success" /></Suspense>;
}
