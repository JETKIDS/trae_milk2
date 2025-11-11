import { BulkCollectionClient } from "./BulkCollectionClient";

export const dynamic = "force-dynamic";

export default async function BulkCollectionPage() {
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">一括入金</h1>
      <BulkCollectionClient />
    </main>
  );
}


