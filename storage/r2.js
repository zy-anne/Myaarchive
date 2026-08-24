// ─── Cloudflare R2 Storage ──────────────────────────────────────────────
//
// R2 is S3-compatible, so the standard AWS SDK v3 S3 client works against
// it unmodified — just point `endpoint` at the R2 account endpoint.
//
// Env vars required (see PHASE4_NOTES.md):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
//
// Key naming convention — flat prefixes by asset type, then a random id so
// keys never collide and never leak filesystem structure:
//   covers/{uuid}.{ext}          series & volume covers
//   portraits/{uuid}.{ext}       character profile images
//   gallery/{seriesId}/{uuid}.{ext}
//   attachments/{seriesId}/{uuid}-{originalName}
//   navicons/{uuid}.{ext}
//
// Every uploader function below returns the KEY (not a URL) — that's what
// gets stored in the DB columns (cover_image_path, etc.), matching the
// schema comment. Rendering the image in the UI means calling
// getSignedDownloadUrl(key) or, if the bucket is public, building the
// public URL — decide that based on whether you want covers/gallery to be
// world-readable or gated behind Clerk auth (recommend private + signed
// URLs, since this is a personal library, not a public gallery).

const {
    S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const path = require('path');

function createR2Client({ accountId, accessKeyId, secretAccessKey }) {
    return new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
    });
}

function makeKey(prefix, originalFileName = '') {
    const ext = path.extname(originalFileName) || '';
    const id = crypto.randomUUID();
    return `${prefix}/${id}${ext}`;
}

async function uploadBuffer(s3, bucket, key, buffer, contentType) {
    await s3.send(new PutObjectCommand({
        Bucket: bucket, Key: key, Body: buffer, ContentType: contentType,
    }));
    return key;
}

async function deleteObject(s3, bucket, key) {
    if (!key) return;
    try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch {
        // Non-fatal — matches the old fs.unlinkSync try/catch behavior for
        // missing local files.
    }
}

async function getSignedDownloadUrl(s3, bucket, key, expiresInSeconds = 3600) {
    if (!key) return null;
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(s3, cmd, { expiresIn: expiresInSeconds });
}

async function downloadBuffer(s3, bucket, key) {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const chunks = [];
    for await (const chunk of res.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
}

module.exports = { createR2Client, makeKey, uploadBuffer, deleteObject, getSignedDownloadUrl, downloadBuffer };