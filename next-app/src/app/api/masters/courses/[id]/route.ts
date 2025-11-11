import type { SupabaseClient } from "@supabase/supabase-js";
import { badRequest, internalError } from "@/lib/api/responses";
import { withServiceSupabase } from "@/lib/supabaseServer";
import { parsePathId } from "@/lib/validators/parameters";

const normalizeCourse = (row: Record<string, unknown>) => ({
  id: row.id,
  custom_id: row.custom_id,
  course_name: row.course_name,
  description: row.description,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const reassignCourseIds = async (client: SupabaseClient) => {
  const { data, error } = await client
    .from("delivery_courses")
    .select("id, custom_id")
    .order("id");

  if (error) {
    throw new Error(error.message);
  }

  const updates = [];
  for (let i = 0; i < (data ?? []).length; i += 1) {
    const course = data?.[i];
    const nextId = String(i + 1).padStart(3, "0");
    if (course?.custom_id !== nextId) {
      updates.push(
        client
          .from("delivery_courses")
          .update({ custom_id: nextId })
          .eq("id", course?.id),
      );
    }
  }

  await Promise.all(updates);
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

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  let id: number;
  try {
    id = parsePathId(params.id);
  } catch {
    return badRequest("コースIDが不正です");
  }

  const body = await request.json();
  const courseName = body?.course_name;
  const customId = body?.custom_id;
  const description = body?.description;

  if (!courseName || typeof courseName !== "string") {
    return badRequest("course_name は必須です");
  }

  return withServiceSupabase(async (client) => {
    try {
      const { data: before, error: fetchError } = await client
        .from("delivery_courses")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (fetchError) {
        return internalError("コースの更新前データ取得に失敗しました", fetchError.message);
      }

      if (!before) {
        return badRequest("指定されたコースが見つかりません");
      }

      const { data, error } = await client
        .from("delivery_courses")
        .update({
          course_name: courseName,
          custom_id: customId ?? null,
          description: description ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (error) {
        return internalError("コースの更新に失敗しました", error.message);
      }

      await pushCourseUndo(client, "course_update", { before }, id);

      return Response.json({ course: normalizeCourse(data) });
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined;
      return internalError("コースの更新に失敗しました", message);
    }
  });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  let id: number;
  try {
    id = parsePathId(params.id);
  } catch {
    return badRequest("コースIDが不正です");
  }

  return withServiceSupabase(async (client) => {
    const { data: customerRow, error: customerError } = await client
      .from("customers")
      .select("id")
      .eq("course_id", id)
      .limit(1)
      .maybeSingle();

    if (customerError) {
      return internalError("コース削除時の顧客チェックに失敗しました", customerError.message);
    }

    if (customerRow) {
      return badRequest("このコースに紐づく顧客が存在するため削除できません");
    }

    const { data: before, error: fetchError } = await client
      .from("delivery_courses")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      return internalError("コース削除前のデータ取得に失敗しました", fetchError.message);
    }

    if (!before) {
      return badRequest("指定されたコースが見つかりません");
    }

    const { error: deleteError } = await client.from("delivery_courses").delete().eq("id", id);
    if (deleteError) {
      return internalError("コースの削除に失敗しました", deleteError.message);
    }

    await reassignCourseIds(client);
    await pushCourseUndo(client, "course_delete", { deleted: before }, id);

    return Response.json({ message: "コースを削除しました" });
  });
}

