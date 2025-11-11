import { notFound } from "next/navigation";
import { loadCustomerDetail } from "./loadCustomerDetail";
import CustomerDetailClient from "./CustomerDetailClient";

type PageProps = {
  params: { customerId: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

const parseYearMonth = (searchParams: PageProps["searchParams"]) => {
  const now = new Date();
  const fallbackYear = now.getFullYear();
  const fallbackMonth = now.getMonth() + 1;

  if (!searchParams) {
    return { year: fallbackYear, month: fallbackMonth };
  }

  const { year: yearParam, month: monthParam } = searchParams;
  const yearCandidate = Array.isArray(yearParam) ? yearParam[0] : yearParam;
  const monthCandidate = Array.isArray(monthParam) ? monthParam[0] : monthParam;

  const parsedYear = yearCandidate ? Number(yearCandidate) : fallbackYear;
  const parsedMonth = monthCandidate ? Number(monthCandidate) : fallbackMonth;

  if (!Number.isFinite(parsedYear) || !Number.isFinite(parsedMonth)) {
    return { year: fallbackYear, month: fallbackMonth };
  }

  const normalizedMonth = Math.min(Math.max(Math.round(parsedMonth), 1), 12);

  return {
    year: Math.round(parsedYear),
    month: normalizedMonth,
  };
};

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params, searchParams }: PageProps) {
  const customerId = Number(params.customerId);

  if (!Number.isFinite(customerId)) {
    notFound();
  }

  const { year, month } = parseYearMonth(searchParams);

  let data;
  try {
    data = await loadCustomerDetail(customerId, year, month);
  } catch (error) {
    console.error("[customers/[customerId]] failed to load detail:", error);
    notFound();
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <CustomerDetailClient data={data} />
    </main>
  );
}

