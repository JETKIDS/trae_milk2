"use server";

import { revalidatePath } from "next/cache";
import { createServiceSupabaseClient, withServiceSupabase } from "@/lib/supabaseServer";
import { ensureAdmin } from "@/lib/auth/server";

export type ActionState = {
  success: boolean;
  message?: string;
};

export const initialActionState: ActionState = { success: false };

const MASTERS_PATH = "/masters";

export type StaffRow = {
  id: number;
  staff_name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  course_id: number | null;
};

export type ManufacturerRow = {
  id: number;
  manufacturer_name: string;
  contact_info: string | null;
  notes: string | null;
};

export type CompanyRow = {
  id: number;
  company_name: string;
  company_name_kana_half: string | null;
  postal_code: string | null;
  address: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  representative: string | null;
  business_hours: string | null;
  established_date: string | null;
  capital: string | null;
  business_description: string | null;
  updated_at?: string | null;
};

export type InstitutionRow = {
  id: number;
  institution_name: string | null;
  bank_code_7: string | null;
  bank_name: string | null;
  branch_name: string | null;
  agent_name_half: string | null;
  agent_code: string | null;
  header_leading_digit: string | null;
  notes: string | null;
  updated_at?: string | null;
};

export type MastersData = {
  staff: StaffRow[];
  manufacturers: ManufacturerRow[];
  company: CompanyRow | null;
  institution: InstitutionRow | null;
};

const normalizeCompany = (row: Partial<CompanyRow> | null | undefined): CompanyRow => ({
  id: row?.id ?? 1,
  company_name: row?.company_name ?? "",
  company_name_kana_half: row?.company_name_kana_half ?? null,
  postal_code: row?.postal_code ?? null,
  address: row?.address ?? null,
  phone: row?.phone ?? null,
  fax: row?.fax ?? null,
  email: row?.email ?? null,
  representative: row?.representative ?? null,
  business_hours: row?.business_hours ?? null,
  established_date: row?.established_date ?? null,
  capital: row?.capital ?? null,
  business_description: row?.business_description ?? null,
  updated_at: row?.updated_at ?? null,
});

const normalizeInstitution = (row: Partial<InstitutionRow> | null | undefined): InstitutionRow => ({
  id: row?.id ?? 1,
  institution_name: row?.institution_name ?? null,
  bank_code_7: row?.bank_code_7 ?? null,
  bank_name: row?.bank_name ?? null,
  branch_name: row?.branch_name ?? null,
  agent_name_half: row?.agent_name_half ?? null,
  agent_code: row?.agent_code ?? null,
  header_leading_digit: row?.header_leading_digit ?? null,
  notes: row?.notes ?? null,
  updated_at: row?.updated_at ?? null,
});

export async function getMastersData(): Promise<MastersData> {
  return withServiceSupabase(async (client) => {
    const [{ data: staff }, { data: manufacturers }, { data: company }, { data: institution }] = await Promise.all([
      client.from("delivery_staff").select("*").order("id"),
      client.from("manufacturers").select("*").order("manufacturer_name"),
      client.from("company_info").select("*").eq("id", 1).maybeSingle(),
      client.from("institution_info").select("*").eq("id", 1).maybeSingle(),
    ]);

    return {
      staff: (staff ?? []).map((row) => ({
        id: row.id as number,
        staff_name: row.staff_name as string,
        phone: (row.phone as string | null) ?? null,
        email: (row.email as string | null) ?? null,
        notes: (row.notes as string | null) ?? null,
        course_id: (row.course_id as number | null) ?? null,
      })) as StaffRow[],
      manufacturers: (manufacturers ?? []).map((row) => ({
        id: row.id as number,
        manufacturer_name: row.manufacturer_name as string,
        contact_info: (row.contact_info as string | null) ?? null,
        notes: (row.notes as string | null) ?? null,
      })) as ManufacturerRow[],
      company: company ? normalizeCompany(company) : null,
      institution: institution ? normalizeInstitution(institution) : null,
    };
  });
}

type ServiceClient = ReturnType<typeof createServiceSupabaseClient>;

const pushMasterUndo = async (
  client: ServiceClient,
  entityType: string,
  entityId: number | null,
  actionType: string,
  payload: Record<string, unknown>,
  metadata?: Record<string, unknown> | null,
) => {
  const { error } = await client.rpc("rpc_push_master_undo", {
    target_entity_type: entityType,
    target_entity_id: entityId,
    target_action_type: actionType,
    target_payload: payload,
    target_metadata: metadata ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
};

export async function createStaffAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const staffName = formData.get("staff_name");
  if (typeof staffName !== "string" || staffName.trim() === "") {
    return { success: false, message: "スタッフ名は必須です" };
  }

  const trimmedName = staffName.trim();

  try {
    const {
      session: { user },
    } = await ensureAdmin();

    const created = await withServiceSupabase(async (client) => {
      const { data, error } = await client
        .from("delivery_staff")
        .insert({ staff_name: trimmedName })
        .select("*")
        .maybeSingle();
      if (error) {
        throw new Error(error.message);
      }
      if (!data) {
        throw new Error("スタッフの作成結果を取得できませんでした");
      }

      await pushMasterUndo(
        client,
        "staff",
        (data.id as number) ?? null,
        "staff_create",
        {
          staff: {
            id: data.id,
            staff_name: data.staff_name,
            phone: data.phone,
            email: data.email,
            notes: data.notes,
            course_id: data.course_id,
            created_at: data.created_at,
            updated_at: data.updated_at,
          },
        },
        { performed_by: user.id },
      );

      return data;
    });

    revalidatePath(MASTERS_PATH);
    return { success: true, message: `スタッフ「${created.staff_name}」を追加しました` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "スタッフの追加に失敗しました";
    return { success: false, message };
  }
}

export async function deleteStaffAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  const staffId = Number(id);
  if (!Number.isFinite(staffId)) {
    return { success: false, message: "スタッフIDが不正です" };
  }

  try {
    const {
      session: { user },
    } = await ensureAdmin();

    await withServiceSupabase(async (client) => {

      const { data: existing, error: existingError } = await client
        .from("delivery_staff")
        .select("*")
        .eq("id", staffId)
        .maybeSingle();
      if (existingError) {
        throw new Error(existingError.message);
      }
      if (!existing) {
        throw new Error("スタッフが見つかりません");
      }

      const { data: customerRow, error: customerError } = await client
        .from("customers")
        .select("id")
        .eq("staff_id", staffId)
        .limit(1)
        .maybeSingle();
      if (customerError) {
        throw new Error(customerError.message);
      }
      if (customerRow) {
        throw new Error("担当顧客が存在するため削除できません");
      }

      await pushMasterUndo(
        client,
        "staff",
        staffId,
        "staff_delete",
        {
          deleted: existing,
        },
        { performed_by: user.id },
      );

      const { error } = await client.from("delivery_staff").delete().eq("id", staffId);
      if (error) {
        throw new Error(error.message);
      }
    });

    revalidatePath(MASTERS_PATH);
    return { success: true, message: "スタッフを削除しました" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "スタッフの削除に失敗しました";
    return { success: false, message };
  }
}

export async function createManufacturerAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const name = formData.get("manufacturer_name");
  const contact = formData.get("contact_info");
  if (typeof name !== "string" || name.trim() === "") {
    return { success: false, message: "メーカー名は必須です" };
  }

  const trimmedName = name.trim();
  const contactInfo = typeof contact === "string" && contact.trim().length > 0 ? contact.trim() : null;

  try {
    const {
      session: { user },
    } = await ensureAdmin();

    const created = await withServiceSupabase(async (client) => {
      const { data, error } = await client
        .from("manufacturers")
        .insert({ manufacturer_name: trimmedName, contact_info: contactInfo })
        .select("*")
        .maybeSingle();
      if (error) {
        throw new Error(error.message);
      }
      if (!data) {
        throw new Error("メーカーの作成結果を取得できませんでした");
      }

      await pushMasterUndo(
        client,
        "manufacturer",
        (data.id as number) ?? null,
        "manufacturer_create",
        {
          manufacturer: data,
        },
        { performed_by: user.id },
      );

      return data;
    });

    revalidatePath(MASTERS_PATH);
    return { success: true, message: `メーカー「${created.manufacturer_name}」を追加しました` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "メーカーの追加に失敗しました";
    return { success: false, message };
  }
}

export async function deleteManufacturerAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  const manufacturerId = Number(id);
  if (!Number.isFinite(manufacturerId)) {
    return { success: false, message: "メーカーIDが不正です" };
  }

  try {
    const {
      session: { user },
    } = await ensureAdmin();

    await withServiceSupabase(async (client) => {
      const { data: existing, error: existingError } = await client
        .from("manufacturers")
        .select("*")
        .eq("id", manufacturerId)
        .maybeSingle();
      if (existingError) {
        throw new Error(existingError.message);
      }
      if (!existing) {
        throw new Error("メーカーが見つかりません");
      }

      const { data: productRow, error: productError } = await client
        .from("products")
        .select("id")
        .eq("manufacturer_id", manufacturerId)
        .limit(1)
        .maybeSingle();
      if (productError) {
        throw new Error(productError.message);
      }
      if (productRow) {
        throw new Error("紐づく商品が存在するため削除できません");
      }

      await pushMasterUndo(
        client,
        "manufacturer",
        manufacturerId,
        "manufacturer_delete",
        {
          deleted: existing,
        },
        { performed_by: user.id },
      );

      const { error } = await client.from("manufacturers").delete().eq("id", manufacturerId);
      if (error) {
        throw new Error(error.message);
      }
    });

    revalidatePath(MASTERS_PATH);
    return { success: true, message: "メーカーを削除しました" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "メーカーの削除に失敗しました";
    return { success: false, message };
  }
}

export async function saveCompanyAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const companyName = formData.get("company_name");
  if (typeof companyName !== "string" || companyName.trim() === "") {
    return { success: false, message: "会社名は必須です" };
  }

  const halfKanaRegex = /^[\uFF65-\uFF9F\u0020]+$/;
  const companyNameKana = formData.get("company_name_kana_half");
  if (companyNameKana && typeof companyNameKana === "string") {
    const trimmed = companyNameKana.slice(0, 30);
    if (trimmed.length > 0 && !halfKanaRegex.test(trimmed)) {
      return { success: false, message: "会社名（読み）は半角カナで入力してください" };
    }
  }

  const payload = {
    company_name: companyName,
    company_name_kana_half: formData.get("company_name_kana_half")?.toString().slice(0, 30) ?? null,
    postal_code: formData.get("postal_code")?.toString() ?? null,
    address: formData.get("address")?.toString() ?? null,
    phone: formData.get("phone")?.toString() ?? null,
    fax: formData.get("fax")?.toString() ?? null,
    email: formData.get("email")?.toString() ?? null,
    representative: formData.get("representative")?.toString() ?? null,
    business_hours: formData.get("business_hours")?.toString() ?? null,
    established_date: formData.get("established_date")?.toString() ?? null,
    capital: formData.get("capital")?.toString() ?? null,
    business_description: formData.get("business_description")?.toString() ?? null,
  };

  try {
    const {
      session: { user },
    } = await ensureAdmin();

    await withServiceSupabase(async (client) => {

      const { data: before, error: beforeError } = await client.from("company_info").select("*").eq("id", 1).maybeSingle();
      if (beforeError) {
        throw new Error(beforeError.message);
      }

      await pushMasterUndo(
        client,
        "company",
        1,
        "company_update",
        {
          before: before ?? {},
        },
        { performed_by: user.id },
      );

      const { error } = await client
        .from("company_info")
        .upsert({ id: 1, ...payload, updated_at: new Date().toISOString() });
      if (error) {
        throw new Error(error.message);
      }
    });

    revalidatePath(MASTERS_PATH);
    return { success: true, message: "会社情報を保存しました" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "会社情報の保存に失敗しました";
    return { success: false, message };
  }
}

export async function saveInstitutionAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const payload: Record<string, unknown> = {};
  for (const key of [
    "institution_name",
    "bank_code_7",
    "bank_name",
    "branch_name",
    "agent_name_half",
    "agent_code",
    "header_leading_digit",
    "notes",
  ]) {
    const value = formData.get(key);
    payload[key] = value ? value.toString() : null;
  }

  if (payload.bank_code_7 && !/^\d{7}$/.test(payload.bank_code_7 as string)) {
    return { success: false, message: "金融機関コードは半角数字7桁で入力してください" };
  }
  const halfKanaRegex = /^[\uFF65-\uFF9F\u0020]+$/;
  if (payload.agent_name_half) {
    const value = payload.agent_name_half as string;
    if (value.length > 0 && !halfKanaRegex.test(value)) {
      return { success: false, message: "委託者名は半角カタカナで入力してください（スペース可）" };
    }
  }
  if (payload.header_leading_digit && !/^\d+$/.test(payload.header_leading_digit as string)) {
    return { success: false, message: "ヘッダー先頭の数字は半角数字で入力してください" };
  }
  if (payload.agent_code && !/^\d+$/.test(payload.agent_code as string)) {
    return { success: false, message: "委託者コードは半角数字で入力してください" };
  }

  try {
    const {
      session: { user },
    } = await ensureAdmin();

    await withServiceSupabase(async (client) => {

      const { data: before, error: beforeError } = await client
        .from("institution_info")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (beforeError) {
        throw new Error(beforeError.message);
      }

      await pushMasterUndo(
        client,
        "institution",
        1,
        "institution_update",
        {
          before: before ?? {},
        },
        { performed_by: user.id },
      );

      const { error } = await client
        .from("institution_info")
        .upsert({ id: 1, ...payload, updated_at: new Date().toISOString() });
      if (error) {
        throw new Error(error.message);
      }
    });

    revalidatePath(MASTERS_PATH);
    return { success: true, message: "収納機関情報を保存しました" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "収納機関情報の保存に失敗しました";
    return { success: false, message };
  }
}

