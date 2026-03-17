import { decode } from "npm:base64-arraybuffer";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

export type Attachment = {
  title: string;
  type: string;
  path: string;
  src: string;
};

// Allowed MIME types for email attachments
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
]);

// 10 MB max per attachment
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

/**
 * Extracts the attachments from the email and upload them to Supabase Storage.
 *
 * Example:
 *   "Attachments": [
 *      {
 *          "Name": "test.txt",
 *          "Content": "VGhpcyBpcyBhdHRhY2htZW50IGNvbnRlbnRzLCBiYXNlLTY0IGVuY29kZWQu",
 *          "ContentType": "text/plain",
 *          "ContentLength": 45
 *      }
 *   ]
 *
 * Return Value:
 * [{
 *    title: "test.txt",
 *    type: "text/plain",
 *    "path": "0.8262106278726917.txt",
 *    "src": "http://127.0.0.1:54321/storage/v1/object/public/attachments/0.8262106278726917.txt",
 * }]
 *
 */
export const extractAndUploadAttachments = async (
  Attachments: {
    Name: string;
    Content: string;
    ContentType: string;
    ContentLength: number;
  }[],
): Promise<Attachment[]> => {
  return (
    await Promise.all(
      (Attachments || []).map(async (attachment) => {
        const { Name, Content, ContentType, ContentLength } = attachment;
        if (!Name || !Content || !ContentType) {
          console.warn("Attachment is missing required fields, skipping");
          return null;
        }

        // Validate MIME type
        if (!ALLOWED_MIME_TYPES.has(ContentType)) {
          console.warn(
            `Attachment "${Name}" has disallowed type "${ContentType}", skipping`,
          );
          return null;
        }

        // Validate file size
        if (ContentLength > MAX_ATTACHMENT_SIZE) {
          console.warn(
            `Attachment "${Name}" exceeds size limit (${ContentLength} bytes), skipping`,
          );
          return null;
        }

        const decodedContent = decode(Content);
        if (!decodedContent) {
          console.error("Failed to decode attachment content, skipping");
          return null;
        }

        const fileParts = Name.split(".");
        const fileExt = fileParts.length > 1 ? `.${Name.split(".").pop()}` : "";
        const fileName = `${Math.random()}${fileExt}`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from("attachments")
          .upload(fileName, decodedContent);

        if (uploadError) {
          console.error("uploadError", uploadError);
          throw new Error("Failed to upload attachment");
        }

        const { data } = supabaseAdmin.storage
          .from("attachments")
          .getPublicUrl(fileName);

        return {
          title: Name,
          type: ContentType,
          path: fileName,
          src: fixPublicUrl(data.publicUrl),
        };
      }),
    )
  ).filter(Boolean) as Attachment[];
};

/*
 * Workaround fix for public URL not working on local environment
 * See https://github.com/orgs/supabase/discussions/37271
 *
 * Replaces http://kong:8000/storage/v1/object/public/attachments/0.08968261048718773.txt with http://127.0.0.1:54321/storage/v1/object/public/attachments/0.08968261048718773.txt, using the SB_JWT_ISSUER env var (value http://127.0.0.1:54321/auth/v1) to get the external/public URL of the Supabase instance.
 */
const fixPublicUrl = (url: string) => {
  const jwtIssuer = Deno.env.get("SB_JWT_ISSUER") ?? "";
  const localUrl = jwtIssuer.replace("/auth/v1", "");
  return url.replace("http://kong:8000", localUrl);
};
