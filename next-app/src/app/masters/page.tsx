import { getMastersData } from "./actions";
import { MastersPageClient, Staff, Manufacturer, Company, Institution } from "./MastersPageClient";

export const dynamic = "force-dynamic";

export default async function MastersPage() {
  const data = await getMastersData();

  const componentKey = [
    data.company?.updated_at ?? "company-none",
    data.institution?.updated_at ?? "institution-none",
    data.staff.length,
    data.manufacturers.length,
  ].join("|");

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">マスター管理</h1>
      <MastersPageClient
        key={componentKey}
        staff={data.staff as Staff[]}
        manufacturers={data.manufacturers as Manufacturer[]}
        company={(data.company as Company | null) ?? null}
        institution={(data.institution as Institution | null) ?? null}
      />
    </main>
  );
}

