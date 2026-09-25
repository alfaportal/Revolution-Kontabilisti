const path = require("path");
const fs = require("fs");
const { INVOICES_DIR, DATA_DIR } = require("./data-paths");

function photoExt(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "application/pdf") return "pdf";
  return "jpg";
}

function savePurchasePhoto(internalNumber, invoiceDate, base64, mimeType) {
  if (!base64 || !internalNumber) return null;
  const ym = (invoiceDate || new Date().toISOString().slice(0, 10)).slice(0, 7);
  const dir = path.join(INVOICES_DIR, ym);
  fs.mkdirSync(dir, { recursive: true });
  const safeNum = String(internalNumber).replace(/[^\w-]/g, "_");
  const filename = `${safeNum}_foto.${photoExt(mimeType)}`;
  const fullPath = path.join(dir, filename);
  fs.writeFileSync(fullPath, Buffer.from(base64, "base64"));
  return path.relative(DATA_DIR, fullPath).split(path.sep).join("/");
}

/** Z-0045_2026-08-15_foto.jpg, SH-..., SP-... */
function saveRecordPhoto(docNumber, recordDate, base64, mimeType) {
  if (!base64 || !docNumber) return null;
  const dateIso = (recordDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const ym = dateIso.slice(0, 7);
  const dir = path.join(INVOICES_DIR, ym);
  fs.mkdirSync(dir, { recursive: true });
  const safeNum = String(docNumber).replace(/[^\w-]/g, "_");
  const filename = `${safeNum}_${dateIso}_foto.${photoExt(mimeType)}`;
  const fullPath = path.join(dir, filename);
  fs.writeFileSync(fullPath, Buffer.from(base64, "base64"));
  return path.relative(DATA_DIR, fullPath).split(path.sep).join("/");
}

function attachPhotoFromBody(body, docNumber, recordDate) {
  if (!body?.photo_attachment?.base64) return body?.photo_path || null;
  return saveRecordPhoto(
    docNumber,
    recordDate,
    body.photo_attachment.base64,
    body.photo_attachment.mimeType || "image/jpeg"
  );
}

function resolvePhotoPath(stored) {
  if (!stored) return null;
  const full = path.isAbsolute(stored) ? stored : path.join(DATA_DIR, stored.replace(/\//g, path.sep));
  return fs.existsSync(full) ? full : null;
}

module.exports = { savePurchasePhoto, saveRecordPhoto, attachPhotoFromBody, resolvePhotoPath, photoExt };
