import { NextResponse } from "next/server";

export const notImplemented = (message: string) =>
  NextResponse.json({ error: message }, { status: 501 });

export const badRequest = (message: string) =>
  NextResponse.json({ error: message }, { status: 400 });

export const internalError = (message: string, detail?: string) =>
  NextResponse.json({ error: message, detail }, { status: 500 });

