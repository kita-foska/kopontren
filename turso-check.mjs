import { createClient } from "@libsql/client";
import { writeFileSync } from "node:fs";

const url = process.env.TURSO_URL;
const token = process.env.TURSO_TOKEN;
if (!url || !token) {
  writeFileSync(process.env.OUT || "turso-check.out", "MISSING ENV\n");
  process.exit(1);
}

const out = [];
const adapter = async (input, init) => {
  const res = await fetch(input, init);
  let bodyText = "";
  try { bodyText = await res.clone().text(); } catch {}
  out.push(`HTTP ${res.status} ${String(input).replace(token, "<TOKEN>")}\nBODY: ${bodyText.slice(0, 2000)}`);
  return res;
};
const client = createClient({ url, authToken: token, fetch: adapter });
try {
  const ping = await client.execute("SELECT 1 AS ok");
  out.push("CONNECT: ok", `rows returned: ${JSON.stringify(ping.rows)}`, "");

  const sm = await client.execute(
    "SELECT type, name, sql FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name"
  );
  out.push("=== SCHEMA (tables & indexes) ===");
  for (const r of sm.rows) out.push(`[${r[0]}] ${r[1]}\n   ${r[2] ?? ""}`);
  out.push("");

  try {
    const sv = await client.execute("SELECT * FROM schema_version");
    out.push("=== schema_version ===");
    for (const r of sv.rows) out.push(JSON.stringify(r));
    out.push("");
  } catch (e) {
    out.push("schema_version table: N/A (" + e.message + ")\n");
  }

  const tables = sm.rows.filter((r) => r[0] === "table").map((r) => r[1]);
  out.push("=== ROW COUNTS ===");
  for (const t of tables) {
    try {
      const c = await client.execute(`SELECT COUNT(*) AS n FROM ${t}`);
      out.push(`${t}: ${c.rows[0].n}`);
    } catch (e) {
      out.push(`${t}: ERROR ${e.message}`);
    }
  }
} catch (e) {
  out.push("ERROR: " + (e?.message || String(e)));
  out.push("ERROR name: " + e?.name);
  out.push("ERROR stack: " + e?.stack);
  out.push("ERROR keys: " + Object.keys(e ?? {}).join(","));
  try { out.push("ERROR cause: " + JSON.stringify(e?.cause)); } catch {}
  try {
    const variants = [
      { label: "libsql+authToken", cfg: { url: url, authToken: token } },
      { label: "https+authToken", cfg: { url: url.replace(/^libsql:/, "https:"), authToken: token } },
      { label: "embedded-token", cfg: { url: url.replace("libsql://", "libsql://:" + token + "@") } },
    ];
    const { createClient: mk } = await import("@libsql/client");
    for (const v of variants) {
      try {
        const c = mk(v.cfg);
        const r = await c.execute("SELECT 1 AS ok");
        out.push(`TRY ${v.label}: ok -> ${JSON.stringify(r.rows)}`);
      } catch (e2) {
        out.push(`TRY ${v.label}: failed -> ${e2?.message || String(e2)}`);
        try { out.push(`TRY ${v.label} cause: ${JSON.stringify(e2?.cause)}`); } catch {}
      }
    }
  } catch (e2) {
    out.push("RETRY block failed: " + (e2?.message || String(e2)));
  }
}
const outFile = process.env.OUT || "turso-check.out";
writeFileSync(outFile, out.join("\n"), "utf8");
console.log("WROTE " + outFile);
