export interface DmConversation {
  id: number;
  org_type: "internal" | "portal";
  company_id: number | null;
  participant_1_id: string;
  participant_2_id: string;
  last_message_at: string;
  last_message_preview: string | null;
  created_at: string;
  otherUser?: {
    id: string;
    first_name: string;
    last_name: string;
    avatar?: { src: string } | null;
  };
}

export interface DmMessage {
  id: number;
  conversation_id: number;
  sender_id: string;
  body: string;
  image_url?: string | null;
  created_at: string;
  read_at: string | null;
}

export interface OrgUser {
  authId: string;
  first_name: string;
  last_name: string;
  avatar?: { src: string } | null;
}

export function canonicalParticipants(
  a: string,
  b: string,
): [string, string] {
  return a < b ? [a, b] : [b, a];
}
