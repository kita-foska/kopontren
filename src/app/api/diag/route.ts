import { NextResponse } from 'next/server';
import { db } from '@/db';

// TEMPORARY diagnostic endpoint - delete this folder after diagnosis.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const url = process.env.DATABASE_URL ?? '';
  const token = process.env.DATABASE_AUTH_TOKEN ?? '';
  const out: Record<string, unknown> = {
    node_version: process.version,
    has_url: !!url,
    url: url ? url.replace(/(token=|\/)/, '$1***MASKED-REST***/') : '(not set)',
    has_token: !!token,
    token_preview: token ? `${token.slice(0, 4)}...(len=${token.length})` : '(not set)',
  };
  try {
    const d = await db();
    const row = (await d.prepare('SELECT 1 AS ok').get()) as { ok: number };
    out.db = 'OK';
    out.check = row;
  } catch (e) {
    out.db = 'FAIL';
    out.error = String((e as Error)?.message ?? e);
  }
  return NextResponse.json(out);
}
