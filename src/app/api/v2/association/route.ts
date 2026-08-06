import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { readAssociationFacilities } from "@/lib/server/adventurerAssociation";
import { nextAssociationFacilityUpgrade } from "@/adventure/data/v2/adventurerAssociation";

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const facilities = await readAssociationFacilities(db);
  return Response.json({
    ok: true,
    facilities: facilities.map((facility) => ({
      ...facility,
      nextUpgrade: nextAssociationFacilityUpgrade(
        facility.buildingId,
        facility.level,
      ),
    })),
  });
}

