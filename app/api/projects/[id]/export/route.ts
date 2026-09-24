import { NextResponse } from "next/server";
import { getProject, notFoundResponse } from "@/lib/access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// PDF export renders the same file the canvas shows, from its isolated
// public storage URL, via headless Chromium (guide §7/§8).
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const res = await getProject(params.id);
  if (!res.ok) return notFoundResponse();
  const supabase = res.admin;

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
    const { data: blob } = await supabase.storage.from("artifacts").download(file.storage_path);
    if (!blob) return NextResponse.json({ error: "file not found" }, { status: 404 });
    return new NextResponse(await blob.text(), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${params.id}.html"`,
      },
    });
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
