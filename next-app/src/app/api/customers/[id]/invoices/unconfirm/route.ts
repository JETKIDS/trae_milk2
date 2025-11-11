import { badRequest, internalError } from "@/lib/api/responses";
import { parseCustomerId } from "@/lib/validators/common";
import { parseInvoiceActionPayload } from "@/lib/validators/invoices";
import { unconfirmInvoice } from "@/lib/supabaseRpc";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let customerId: number;
  try {
    customerId = parseCustomerId(params.id);
  } catch {
    return badRequest("顧客IDが不正です");
  }

  let payload;
  try {
    const body = await request.json();
    payload = parseInvoiceActionPayload(body);
  } catch {
    return badRequest("入力値が不正です");
  }

  try {
    const result = await unconfirmInvoice(customerId, payload.year, payload.month);
    return Response.json({ invoice: result }, { status: 200 });
  } catch (error) {
    return internalError("請求確定解除に失敗しました", error instanceof Error ? error.message : undefined);
  }
}

