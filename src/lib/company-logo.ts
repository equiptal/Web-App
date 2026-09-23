/**
 * **The company logo, from a picked file to a stored KEY.** One copy, used by the verification
 * form's picker (`CompanyIdentityModal`) and by the logo dialog the quotation's «Add a logo» opens
 * (`CompanyLogoModal`, 2026-09-23).
 *
 * Downscaled to 220px and re-encoded as PNG, the app's `downscaleCompanyLogo`, so one firm's mark
 * looks the same wherever it is drawn: an unscaled photo would be embedded at full size in the
 * quotation and the bid form, and PNG keeps transparency on those light documents.
 */
export async function uploadCompanyLogo(file: File): Promise<{ key: string; preview: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("image"));
    i.src = dataUrl;
  });

  const max = 220;
  let { width, height } = img;
  if (width >= height && width > max) {
    height = Math.round((height * max) / width);
    width = max;
  } else if (height > width && height > max) {
    width = Math.round((width * max) / height);
    height = max;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("encode");

  const r = await fetch("/api/profile/doc-upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: "company-logo.png", contentType: "image/png" }),
  });
  if (!r.ok) throw new Error("upload");
  const { url, key } = (await r.json()) as { url: string; key: string };
  const put = await fetch(url, { method: "PUT", body: blob, headers: { "Content-Type": "image/png" } });
  if (!put.ok) throw new Error("upload");
  return { key, preview: canvas.toDataURL("image/png") };
}
