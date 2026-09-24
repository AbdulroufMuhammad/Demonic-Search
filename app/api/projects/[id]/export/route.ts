import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// PDF export renders the same file the canvas shows, from its isolated
// public storage URL, via headless Chromium (guide §7/§8).
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = createAdminClient();

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") ?? "pdf";
  const path = searchParams.get("path") ?? "index.html";

  const { data: file } = await supabase
    .from("files")
    .select("storage_path")
    .eq("project_id", params.id)
    .eq("path", path)
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (!file) return NextResponse.json({ error: "file not found" }, { status: 404 });

  const { data: pub } = supabase.storage.from("artifacts").getPublicUrl(file.storage_path);

  if (format === "html") {
    return NextResponse.redirect(pub.publicUrl);
  }

  if (format !== "pdf") {
    return NextResponse.json({ error: "unsupported format; use pdf or html" }, { status: 400 });
  }

  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  try {
    const page = await browser.newPage();
    await page.goto(pub.publicUrl, { waitUntil: "networkidle" });
    await page.evaluate(() => (document as any).fonts?.ready);
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${params.id}.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
}
