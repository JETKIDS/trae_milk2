"use server";

import { badRequest, internalError } from "@/lib/api/responses";
import { createServiceSupabaseClient, withServiceSupabase } from "@/lib/supabaseServer";

type MasterUndoEntry = {
  id: number;
  entity_type: string;
  entity_id: number | null;
  action_type: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

type ServiceClient = ReturnType<typeof createServiceSupabaseClient>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getNumber = (value: unknown): number | null => (typeof value === "number" ? value : null);
const getString = (value: unknown): string | null => (typeof value === "string" ? value : null);

const reassignCourseIds = async (client: ServiceClient) => {
  const { data, error } = await client.from("delivery_courses").select("id, custom_id").order("id");
  if (error) {
    throw new Error(`コース ID 再割当処理でエラーが発生しました: ${error.message}`);
  }

  const rows = (data ?? []) as { id: number; custom_id: string | null }[];
  const updates = rows.map((row, index) => {
    const nextCustomId = String(index + 1).padStart(3, "0");
    if (row.custom_id === nextCustomId) return Promise.resolve();
    return client.from("delivery_courses").update({ custom_id: nextCustomId }).eq("id", row.id);
  });

  await Promise.all(updates);
};

const applyUndo = async (client: ServiceClient, entry: MasterUndoEntry) => {
  const payload = entry.payload ?? {};

  switch (entry.action_type) {
    case "course_create": {
      const course = isRecord(payload.course) ? payload.course : null;
      const courseId = course ? getNumber(course.id) : null;
      if (courseId !== null) {
        const { error } = await client.from("delivery_courses").delete().eq("id", courseId);
        if (error) throw new Error(error.message);
        await reassignCourseIds(client);
      }
      break;
    }
    case "course_update": {
      const before = isRecord(payload.before) ? payload.before : null;
      const beforeId = before ? getNumber(before.id) : null;
      if (beforeId !== null) {
        const { error } = await client
          .from("delivery_courses")
          .update({
            course_name: getString(before.course_name),
            custom_id: getString(before.custom_id),
            description: getString(before.description),
            updated_at: getString(before.updated_at) ?? new Date().toISOString(),
          })
          .eq("id", beforeId);
        if (error) throw new Error(error.message);
      }
      break;
    }
    case "course_delete": {
      const deleted = isRecord(payload.deleted) ? payload.deleted : null;
      const deletedId = deleted ? getNumber(deleted.id) : null;
      if (deletedId !== null) {
        const { error } = await client
          .from("delivery_courses")
          .insert(
            {
              id: deletedId,
              custom_id: getString(deleted.custom_id),
              course_name: getString(deleted.course_name),
              description: getString(deleted.description),
              created_at: getString(deleted.created_at),
              updated_at: getString(deleted.updated_at),
            },
            { defaultToNull: false },
          )
          .select("id");
        if (error) throw new Error(error.message);
        await reassignCourseIds(client);
      }
      break;
    }
    case "staff_create": {
      const staff = isRecord(payload.staff) ? payload.staff : null;
      const staffId = staff ? getNumber(staff.id) : null;
      if (staffId !== null) {
        const { error } = await client.from("delivery_staff").delete().eq("id", staffId);
        if (error) throw new Error(error.message);
      }
      break;
    }
    case "staff_update": {
      const before = isRecord(payload.before) ? payload.before : null;
      const beforeId = before ? getNumber(before.id) : null;
      if (beforeId !== null) {
        const { error } = await client
          .from("delivery_staff")
          .update({
            staff_name: getString(before.staff_name),
            phone: getString(before.phone),
            email: getString(before.email),
            notes: getString(before.notes),
            course_id: getNumber(before.course_id),
            updated_at: getString(before.updated_at) ?? new Date().toISOString(),
          })
          .eq("id", beforeId);
        if (error) throw new Error(error.message);
      }
      break;
    }
    case "staff_delete": {
      const deleted = isRecord(payload.deleted) ? payload.deleted : null;
      const deletedId = deleted ? getNumber(deleted.id) : null;
      if (deletedId !== null) {
        const { error } = await client
          .from("delivery_staff")
          .insert(
            {
              id: deletedId,
              staff_name: getString(deleted.staff_name),
              phone: getString(deleted.phone),
              email: getString(deleted.email),
              notes: getString(deleted.notes),
              course_id: getNumber(deleted.course_id),
              created_at: getString(deleted.created_at),
              updated_at: getString(deleted.updated_at),
            },
            { defaultToNull: false },
          )
          .select("id");
        if (error) throw new Error(error.message);
      }
      break;
    }
    case "manufacturer_create": {
      const manufacturer = isRecord(payload.manufacturer) ? payload.manufacturer : null;
      const manufacturerId = manufacturer ? getNumber(manufacturer.id) : null;
      if (manufacturerId !== null) {
        const { error } = await client.from("manufacturers").delete().eq("id", manufacturerId);
        if (error) throw new Error(error.message);
      }
      break;
    }
    case "manufacturer_update": {
      const before = isRecord(payload.before) ? payload.before : null;
      const beforeId = before ? getNumber(before.id) : null;
      if (beforeId !== null) {
        const { error } = await client
          .from("manufacturers")
          .update({
            manufacturer_name: getString(before.manufacturer_name),
            contact_info: getString(before.contact_info),
            notes: getString(before.notes),
            updated_at: getString(before.updated_at) ?? new Date().toISOString(),
          })
          .eq("id", beforeId);
        if (error) throw new Error(error.message);
      }
      break;
    }
    case "manufacturer_delete": {
      const deleted = isRecord(payload.deleted) ? payload.deleted : null;
      const deletedId = deleted ? getNumber(deleted.id) : null;
      if (deletedId !== null) {
        const { error } = await client
          .from("manufacturers")
          .insert(
            {
              id: deletedId,
              manufacturer_name: getString(deleted.manufacturer_name),
              contact_info: getString(deleted.contact_info),
              notes: getString(deleted.notes),
              created_at: getString(deleted.created_at),
              updated_at: getString(deleted.updated_at),
            },
            { defaultToNull: false },
          )
          .select("id");
        if (error) throw new Error(error.message);
      }
      break;
    }
    case "company_update": {
      const before = isRecord(payload.before) ? payload.before : null;
      const companyName = before ? getString(before.company_name) : null;
      if (before) {
        if (companyName) {
          const { error } = await client
            .from("company_info")
            .upsert({
              id: 1,
              company_name: companyName,
              company_name_kana_half: getString(before.company_name_kana_half),
              postal_code: getString(before.postal_code),
              address: getString(before.address),
              phone: getString(before.phone),
              fax: getString(before.fax),
              email: getString(before.email),
              representative: getString(before.representative),
              business_hours: getString(before.business_hours),
              established_date: getString(before.established_date),
              capital: getString(before.capital),
              business_description: getString(before.business_description),
              updated_at: getString(before.updated_at) ?? new Date().toISOString(),
            })
            .select("id")
            .maybeSingle();
          if (error) throw new Error(error.message);
        } else {
          const { error } = await client.from("company_info").delete().eq("id", 1);
          if (error) throw new Error(error.message);
        }
      }
      break;
    }
    case "institution_update": {
      const before = isRecord(payload.before) ? payload.before : null;
      if (before) {
        if (Object.keys(before).length > 0) {
          const { error } = await client
            .from("institution_info")
            .upsert({
              id: 1,
              institution_name: getString(before.institution_name),
              bank_code_7: getString(before.bank_code_7),
              bank_name: getString(before.bank_name),
              branch_name: getString(before.branch_name),
              agent_name_half: getString(before.agent_name_half),
              agent_code: getString(before.agent_code),
              header_leading_digit: getString(before.header_leading_digit),
              notes: getString(before.notes),
              updated_at: getString(before.updated_at) ?? new Date().toISOString(),
            })
            .select("id")
            .maybeSingle();
          if (error) throw new Error(error.message);
        } else {
          const { error } = await client.from("institution_info").delete().eq("id", 1);
          if (error) throw new Error(error.message);
        }
      }
      break;
    }
    default:
      throw new Error(`未対応の Undo アクションです: ${entry.action_type}`);
  }
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const entityType = body?.entityType;
  const entityId = body?.entityId ?? null;

  if (!entityType || typeof entityType !== "string") {
    return badRequest("entityType を指定してください");
  }

  return withServiceSupabase(async (client) => {
    const { data: entry, error } = await client
      .rpc("rpc_pop_master_undo", {
        target_entity_type: entityType,
        target_entity_id: entityId,
      })
      .maybeSingle();

    if (error) {
      return internalError("Undo 履歴の取得に失敗しました", error.message);
    }

    if (!entry) {
      return Response.json({ undo: null, message: "取り消す操作がありません" }, { status: 404 });
    }

    try {
      await applyUndo(client, entry as MasterUndoEntry);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Undo 処理に失敗しました";
      return internalError("Undo 処理に失敗しました", message);
    }

    return Response.json({ undo: entry });
  });
}


