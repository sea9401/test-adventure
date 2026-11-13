"use client";

import { useState } from "react";
import { FarmBreedingPanel } from "@/adventure/v2/FarmBreedingPanel";
import {
  FARM_CROP_LIST,
  emptyFarmState,
  type FarmCropId,
  type FarmState,
} from "@/adventure/v2/farm";
import { breedFarmCrop } from "@/adventure/v2/farmBreeding";

const PREVIEW_INFO = { masterUnlocked: false, masterCropHeld: 2 };

function previewFarm(): FarmState {
  return {
    ...emptyFarmState(1_800_000_000_000),
    inventory: {
      wheat: 17_864,
      golden_wheat: 147,
      herb: 146,
      silverleaf: 9,
      corn: 1_300,
      sweet_corn: 30,
      tomato: 139,
      heirloom_tomato: 7,
      strawberry: 20,
      potato: 190,
      golden_potato: 5,
      rice: 238,
      golden_rice: 4,
      cacao: 248,
      royal_cacao: 7,
    },
    breeding: { wheat: 5, herb: 2, corn: 4, tomato: 1, sugarcane: 6 },
  };
}

// 개발 전용 — 농장 품종 탭을 로그인 없이 확인한다. 개량은 화면 안 mock 상태에만 적용된다.
export default function FarmBreedingPreview() {
  const [farm, setFarm] = useState<FarmState>(previewFarm);
  const breed = (cropId: FarmCropId) => {
    setFarm((current) => breedFarmCrop(current, cropId, PREVIEW_INFO).state);
  };

  return (
    <main className="mx-auto max-w-3xl p-4">
      <FarmBreedingPanel
        farm={farm}
        crops={FARM_CROP_LIST}
        info={PREVIEW_INFO}
        busyCropId={null}
        onBreed={breed}
      />
    </main>
  );
}
