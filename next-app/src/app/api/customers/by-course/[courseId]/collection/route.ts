import { badRequest, internalError } from "@/lib/api/responses";
import { withServiceSupabase } from "@/lib/supabaseServer";
import { parseCourseId } from "@/lib/validators/common";

export async function GET(
  _request: Request,
  { params }: { params: { courseId: string } },
) {
  let courseId: number;

  try {
    courseId = parseCourseId(params.courseId);
  } catch {
    return badRequest("コースIDが不正です");
  }

  return withServiceSupabase(async (client) => {
    const { data, error } = await client
      .from("customers")
      .select(
        `
        id,
        custom_id,
        customer_name,
        address,
        phone,
        delivery_order,
        delivery_courses:delivery_courses (
          course_name,
          custom_id
        ),
        delivery_staff:delivery_staff (
          staff_name
        ),
        customer_settings:customer_settings (
          billing_method,
          rounding_enabled
        )
      `,
      )
      .eq("course_id", courseId)
      .order("delivery_order", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true });

    if (error) {
      return internalError("顧客一覧の取得に失敗しました", error.message);
    }

    // 集金方法でフィルタリング（billing_method が null の場合は 'collection' とみなす）
    const customers = (data ?? [])
      .filter((row) => {
        const billingMethod = (row.customer_settings as { billing_method: string | null } | null)?.billing_method;
        return (billingMethod ?? "collection") === "collection";
      })
      .map((row) => ({
        id: row.id as number,
        custom_id: row.custom_id as string,
        customer_name: row.customer_name as string,
        address: (row.address as string | null) ?? null,
        phone: (row.phone as string | null) ?? null,
        delivery_order: (row.delivery_order as number | null) ?? null,
        course_name: (row.delivery_courses as { course_name: string | null } | null)?.course_name ?? null,
        course_custom_id: (row.delivery_courses as { custom_id: string | null } | null)?.custom_id ?? null,
        billing_method: "collection" as const,
        rounding_enabled: (row.customer_settings as { rounding_enabled: boolean | null } | null)?.rounding_enabled ?? true,
      }));

    return Response.json(customers);
  });
}

