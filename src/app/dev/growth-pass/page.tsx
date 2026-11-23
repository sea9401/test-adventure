import { GrowthPassPreview } from "./GrowthPassPreview";

// dev 빌드와 staging 에서만 열린다(상위 layout 가드).
export default function GrowthPassPreviewPage() {
  return <GrowthPassPreview />;
}
