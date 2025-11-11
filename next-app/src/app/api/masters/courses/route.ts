import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { badRequest, internalError } from "@/lib/api/responses";
import { withServiceSupabase } from "@/lib/supabaseServer";

const normalizeCourse = (row: Record<string, unknown>) => ({
  id: row.id,
  custom_id: row.custom_id,
  course_name: row.course_name,
  description: row.description,
  created_at: row.created_at,
});

const generateNextCourseId = async (client: SupabaseClient) => {
  const { data, error } = await client
    .from("delivery_courses")
    .select("custom_id")
    .order("custom_id", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const used = new Set(
    (data ?? [])
      .map((row) => row.custom_id)
      .filter((id: string | null) => typeof id === "string" && /^\d{3}$/.test(id)),
  );

  for (let n = 1; n <= 999; n += 1) {
    const candidate = String(n).padStart(3, "0");
    if (!used.has(candidate)) {
      return candidate;
    }
  }

  throw new Error("利用可能な3桁IDがありません（001〜999が全て使用済み）");
};

const pushCourseUndo = async (
  client: SupabaseClient,
  actionType: string,
  payload: Record<string, unknown>,
  entityId: number | null,
) => {
  const { error } = await client.rpc("rpc_push_master_undo", {
    target_entity_type: "course",
    target_entity_id: entityId,
    target_action_type: actionType,
    target_payload: payload,
    target_metadata: null,
  });
  if (error) {
    throw new Error(`コースの Undo 記録に失敗しました: ${error.message}`);
  }
};

export async function GET() {
  const { data, error } = await supabase
    .from("delivery_courses")
    .select("*")
    .order("custom_id");

  if (error) return internalError("配達コース一覧の取得に失敗しました", error.message);

  return Response.json({ items: (data ?? []).map(normalizeCourse) });
}

export async function POST() {
  return withServiceSupabase(async (client) => {
    try {
      const nextId = await generateNextCourseId(client);
      const { data, error } = await client
        .from("delivery_courses")
        .insert({
          custom_id: nextId,
          course_name: `新規コース(${nextId})`,
        })
        .select("*")
        .maybeSingle();

      if (error) {
        return internalError("コースの登録に失敗しました", error.message);
      }

      await pushCourseUndo(client, "course_create", { course: data }, data?.id ?? null);

      return Response.json({ course: normalizeCourse(data) }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined;
      return badRequest(message || "コースの登録に失敗しました");
    }
  });
}

