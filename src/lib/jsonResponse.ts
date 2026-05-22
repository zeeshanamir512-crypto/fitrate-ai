import { NextResponse } from "next/server";

export const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" } as const;

export function jsonPayload(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: JSON_HEADERS });
}
