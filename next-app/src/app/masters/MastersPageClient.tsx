"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  createManufacturerAction,
  createStaffAction,
  deleteManufacturerAction,
  deleteStaffAction,
  initialActionState,
  saveCompanyAction,
  saveInstitutionAction,
} from "./actions";

export type Staff = {
  id: number;
  staff_name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  course_id: number | null;
};

export type Manufacturer = {
  id: number;
  manufacturer_name: string;
  contact_info: string | null;
  notes?: string | null;
};

export type Company = {
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
};

export type Institution = {
  id: number;
  institution_name: string | null;
  bank_code_7: string | null;
  bank_name: string | null;
  branch_name: string | null;
  agent_name_half: string | null;
  agent_code: string | null;
  header_leading_digit: string | null;
  notes: string | null;
};

type Props = {
  staff: Staff[];
  manufacturers: Manufacturer[];
  company: Company | null;
  institution: Institution | null;
};

const createCompanyFormState = (value: Company | null): Company => ({
  id: value?.id ?? 1,
  company_name: value?.company_name ?? "",
  company_name_kana_half: value?.company_name_kana_half ?? "",
  postal_code: value?.postal_code ?? "",
  address: value?.address ?? "",
  phone: value?.phone ?? "",
  fax: value?.fax ?? "",
  email: value?.email ?? "",
  representative: value?.representative ?? "",
  business_hours: value?.business_hours ?? "",
  established_date: value?.established_date ?? "",
  capital: value?.capital ?? "",
  business_description: value?.business_description ?? "",
});

const createInstitutionFormState = (value: Institution | null): Institution => ({
  id: value?.id ?? 1,
  institution_name: value?.institution_name ?? "",
  bank_code_7: value?.bank_code_7 ?? "",
  bank_name: value?.bank_name ?? "",
  branch_name: value?.branch_name ?? "",
  agent_name_half: value?.agent_name_half ?? "",
  agent_code: value?.agent_code ?? "",
  header_leading_digit: value?.header_leading_digit ?? "1",
  notes: value?.notes ?? "",
});

const AlertMessage = ({ state }: { state: ReturnType<typeof useFormState>[0] }) => {
  if (!state?.message) return null;
  return (
    <p className={state.success ? "text-green-600" : "text-red-600"} role="status">
      {state.message}
    </p>
  );
};

const SubmitButton = ({ children }: { children: React.ReactNode }) => {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="rounded bg-blue-600 px-3 py-1 text-white disabled:bg-gray-400"
      disabled={pending}
    >
      {pending ? "送信中..." : children}
    </button>
  );
};

export function MastersPageClient({ staff, manufacturers, company, institution }: Props) {
  const [staffName, setStaffName] = useState("");
  const [staffMessage, staffAction] = useFormState(createStaffAction, initialActionState);
  const [staffDeleteMessage, staffDeleteAction] = useFormState(deleteStaffAction, initialActionState);

  const [manufacturerForm, setManufacturerForm] = useState({ name: "", contact: "" });
  const [manufacturerMessage, manufacturerAction] = useFormState(createManufacturerAction, initialActionState);
  const [manufacturerDeleteMessage, manufacturerDeleteAction] = useFormState(
    deleteManufacturerAction,
    initialActionState,
  );

  const [companyForm, setCompanyForm] = useState<Company>(() => createCompanyFormState(company));
  const [companyMessage, companyAction] = useFormState(saveCompanyAction, initialActionState);

  const [institutionForm, setInstitutionForm] = useState<Institution>(() => createInstitutionFormState(institution));
  const [institutionMessage, institutionAction] = useFormState(saveInstitutionAction, initialActionState);

  return (
    <div className="space-y-8">
      <section className="rounded border border-gray-200 p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">スタッフ</h2>
        <form
          action={async (formData) => {
            const result = await staffAction(formData);
            if (result.success) {
              setStaffName("");
            }
            return result;
          }}
          className="mb-4 flex flex-wrap gap-4"
        >
          <input
            type="text"
            name="staff_name"
            placeholder="スタッフ名"
            value={staffName}
            onChange={(e) => setStaffName(e.target.value)}
            className="flex-1 rounded border border-gray-300 px-3 py-2"
          />
          <SubmitButton>スタッフ追加</SubmitButton>
        </form>
        <AlertMessage state={staffMessage} />
        <ul className="space-y-2">
          {staff.map((member) => (
            <li key={member.id} className="flex items-center justify-between rounded border border-gray-200 px-3 py-2">
              <div>
                <p className="font-medium">{member.staff_name}</p>
                {(member.phone || member.email) && (
                  <p className="text-sm text-gray-500">
                    {member.phone ?? "-"} / {member.email ?? "-"}
                  </p>
                )}
              </div>
              <form action={staffDeleteAction}>
                <input type="hidden" name="id" value={member.id} />
                <SubmitButton>削除</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
        <AlertMessage state={staffDeleteMessage} />
      </section>

      <section className="rounded border border-gray-200 p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">メーカー</h2>
        <form
          action={async (formData) => {
            formData.set("manufacturer_name", manufacturerForm.name);
            formData.set("contact_info", manufacturerForm.contact);
            const result = await manufacturerAction(formData);
            if (result.success) {
              setManufacturerForm({ name: "", contact: "" });
            }
            return result;
          }}
          className="mb-4 flex flex-wrap gap-4"
        >
          <input
            type="text"
            name="manufacturer_name"
            placeholder="メーカー名"
            value={manufacturerForm.name}
            onChange={(e) => setManufacturerForm((prev) => ({ ...prev, name: e.target.value }))}
            className="flex-1 rounded border border-gray-300 px-3 py-2"
          />
          <input
            type="text"
            name="contact_info"
            placeholder="連絡先"
            value={manufacturerForm.contact}
            onChange={(e) => setManufacturerForm((prev) => ({ ...prev, contact: e.target.value }))}
            className="flex-1 rounded border border-gray-300 px-3 py-2"
          />
          <SubmitButton>メーカー追加</SubmitButton>
        </form>
        <AlertMessage state={manufacturerMessage} />
        <ul className="space-y-2">
          {manufacturers.map((row) => (
            <li key={row.id} className="flex items-center justify-between rounded border border-gray-200 px-3 py-2">
              <div>
                <p className="font-medium">{row.manufacturer_name}</p>
                {row.contact_info && <p className="text-sm text-gray-500">{row.contact_info}</p>}
              </div>
              <form action={manufacturerDeleteAction}>
                <input type="hidden" name="id" value={row.id} />
                <SubmitButton>削除</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
        <AlertMessage state={manufacturerDeleteMessage} />
      </section>

      <section className="rounded border border-gray-200 p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">会社情報</h2>
        <form
          action={async (formData) => {
            Object.entries(companyForm).forEach(([key, value]) => {
              if (key === "id") return;
              formData.set(key, value ?? "");
            });
            return companyAction(formData);
          }}
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          <label className="flex flex-col text-sm">
            会社名*
            <input
              type="text"
              name="company_name"
              value={companyForm.company_name}
              onChange={(e) => setCompanyForm((prev) => ({ ...prev, company_name: e.target.value }))}
              className="mt-1 rounded border border-gray-300 px-3 py-2"
              required
            />
          </label>
          <label className="flex flex-col text-sm">
            会社名（読み）
            <input
              type="text"
              name="company_name_kana_half"
              value={companyForm.company_name_kana_half ?? ""}
              onChange={(e) => setCompanyForm((prev) => ({ ...prev, company_name_kana_half: e.target.value }))}
              className="mt-1 rounded border border-gray-300 px-3 py-2"
              maxLength={30}
            />
          </label>
          <label className="flex flex-col text-sm">
            郵便番号
            <input
              type="text"
              name="postal_code"
              value={companyForm.postal_code ?? ""}
              onChange={(e) => setCompanyForm((prev) => ({ ...prev, postal_code: e.target.value }))}
              className="mt-1 rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            住所
            <input
              type="text"
              name="address"
              value={companyForm.address ?? ""}
              onChange={(e) => setCompanyForm((prev) => ({ ...prev, address: e.target.value }))}
              className="mt-1 rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            電話番号
            <input
              type="text"
              name="phone"
              value={companyForm.phone ?? ""}
              onChange={(e) => setCompanyForm((prev) => ({ ...prev, phone: e.target.value }))}
              className="mt-1 rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            FAX
            <input
              type="text"
              name="fax"
              value={companyForm.fax ?? ""}
              onChange={(e) => setCompanyForm((prev) => ({ ...prev, fax: e.target.value }))}
              className="mt-1 rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            メール
            <input
              type="email"
              name="email"
              value={companyForm.email ?? ""}
              onChange={(e) => setCompanyForm((prev) => ({ ...prev, email: e.target.value }))}
              className="mt-1 rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            代表者
            <input
              type="text"
              name="representative"
              value={companyForm.representative ?? ""}
              onChange={(e) => setCompanyForm((prev) => ({ ...prev, representative: e.target.value }))}
              className="mt-1 rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            営業時間
            <input
              type="text"
              name="business_hours"
              value={companyForm.business_hours ?? ""}
              onChange={(e) => setCompanyForm((prev) => ({ ...prev, business_hours: e.target.value }))}
              className="mt-1 rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            設立日
            <input
              type="date"
              name="established_date"
              value={companyForm.established_date ?? ""}
              onChange={(e) => setCompanyForm((prev) => ({ ...prev, established_date: e.target.value }))}
              className="mt-1 rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            資本金
            <input
              type="text"
              name="capital"
              value={companyForm.capital ?? ""}
              onChange={(e) => setCompanyForm((prev) => ({ ...prev, capital: e.target.value }))}
              className="mt-1 rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            事業内容
            <input
              type="text"
              name="business_description"
              value={companyForm.business_description ?? ""}
              onChange={(e) => setCompanyForm((prev) => ({ ...prev, business_description: e.target.value }))}
              className="mt-1 rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <div className="md:col-span-2">
            <SubmitButton>会社情報を保存</SubmitButton>
          </div>
        </form>
        <AlertMessage state={companyMessage} />
      </section>

      <section className="rounded border border-gray-200 p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">収納機関情報</h2>
        <form
          action={async (formData) => {
            Object.entries(institutionForm).forEach(([key, value]) => {
              if (key === "id") return;
              formData.set(key, value ?? "");
            });
            return institutionAction(formData);
          }}
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          <label className="flex flex-col text-sm">
            収納機関名
            <input
              type="text"
              name="institution_name"
              value={institutionForm.institution_name ?? ""}
              onChange={(e) => setInstitutionForm((prev) => ({ ...prev, institution_name: e.target.value }))}
              className="mt-1 rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            金融機関コード（7桁）
            <input
              type="text"
              name="bank_code_7"
              value={institutionForm.bank_code_7 ?? ""}
              onChange={(e) => setInstitutionForm((prev) => ({ ...prev, bank_code_7: e.target.value }))}
              className="mt-1 rounded border border-gray-300 px-3 py-2"
              maxLength={7}
            />
          </label>
          <label className="flex flex-col text-sm">
            金融機関名
            <input
              type="text"
              name="bank_name"
              value={institutionForm.bank_name ?? ""}
              onChange={(e) => setInstitutionForm((prev) => ({ ...prev, bank_name: e.target.value }))}
              className="mt-1 rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            支店名
            <input
              type="text"
              name="branch_name"
              value={institutionForm.branch_name ?? ""}
              onChange={(e) => setInstitutionForm((prev) => ({ ...prev, branch_name: e.target.value }))}
              className="mt-1 rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            委託者名（半角カナ）
            <input
              type="text"
              name="agent_name_half"
              value={institutionForm.agent_name_half ?? ""}
              onChange={(e) => setInstitutionForm((prev) => ({ ...prev, agent_name_half: e.target.value }))}
              className="mt-1 rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            委託者コード
            <input
              type="text"
              name="agent_code"
              value={institutionForm.agent_code ?? ""}
              onChange={(e) => setInstitutionForm((prev) => ({ ...prev, agent_code: e.target.value }))}
              className="mt-1 rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            ヘッダー先頭の数字
            <input
              type="text"
              name="header_leading_digit"
              value={institutionForm.header_leading_digit ?? ""}
              onChange={(e) => setInstitutionForm((prev) => ({ ...prev, header_leading_digit: e.target.value }))}
              className="mt-1 rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col text-sm md:col-span-2">
            備考
            <textarea
              name="notes"
              value={institutionForm.notes ?? ""}
              onChange={(e) => setInstitutionForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              rows={3}
            />
          </label>
          <div className="md:col-span-2">
            <SubmitButton>収納機関情報を保存</SubmitButton>
          </div>
        </form>
        <AlertMessage state={institutionMessage} />
      </section>
    </div>
  );
}

