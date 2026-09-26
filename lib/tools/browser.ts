import type { Browser, Page } from "playwright-core";

// Designs may only load from these hosts, so the headless browser blocks everything else.
const ALLOWED_HOSTS = /^(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)$/;

function allowedUploadHost() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
}

// There's no GPU on the server: 3D designs (three.js) render with software WebGL, which newer Chromium only allows with this flag.
const WEBGL_ARGS = ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"];

export async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  if (process.env.CHROMIUM_PATH) return chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: WEBGL_ARGS });
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const sparticuz = (await import("@sparticuz/chromium")).default;
    return chromium.launch({ executablePath: await sparticuz.executablePath(), args: [...sparticuz.args, ...WEBGL_ARGS], headless: true });
  }
  // Local development: Playwright's own installed browser.
  return chromium.launch({ args: WEBGL_ARGS });
}

/** A page with the design loaded, fonts settled, and only allowlisted network access (plus this app's own uploads). */
export async function openDesign(browser: Browser, html: string, viewport: { width: number; height: number }, onError?: (msg: string) => void): Promise<Page> {
  const page = await browser.newPage({ viewport });
  if (onError) {
    page.on("pageerror", (e) => onError(e.message.slice(0, 200)));
    // Failed resource loads are reported separately (as broken images); keep real script errors.
    page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && onError(m.text().slice(0, 200)));
    // A script or stylesheet that doesn't load (a wrong CDN path, a blocked host) breaks the design without a JS error.
    page.on("requestfailed", (r) => {
      const type = r.resourceType();
      if (type === "script" || type === "stylesheet") onError(`Couldn't load ${type} ${r.url().slice(0, 160)} (${r.failure()?.errorText ?? "failed"})`);
    });
  }
  const uploads = allowedUploadHost();
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === "data:" || url.protocol === "blob:" || ALLOWED_HOSTS.test(url.hostname) || (uploads && url.hostname === uploads && url.pathname.includes("/artifacts/uploads/")))
      return route.continue();
    return route.abort();
  });
  await page.setContent(html, { waitUntil: "load", timeout: 20_000 }).catch(() => {});
  await page.evaluate("document.fonts && document.fonts.ready.then(() => true)").catch(() => {});
  await page.waitForTimeout(600);
  return page;
}
