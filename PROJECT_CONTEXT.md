# Chaster CRM — Project Context

> Last updated: 2026-03-17
> This file is a living document. Update it as features are built, bugs are fixed, or plans change.

---

## What Is This?

**Chaster CRM** is a B2B SaaS platform with two sides:

- **Internal CRM** — your team tracks contacts, companies, deals, tasks, and notes. Full Kanban deal pipeline, CSV import/export, staff management.
- **Customer Portal** — clients log in to manage their subscription, usage, AI agent config, team members, and communicate with your team via messaging.

The codebase started from [Atomic CRM](https://github.com/marmelab/atomic-crm) (open source by Marmelab) and has been extended heavily with custom features.

**GitHub:** https://github.com/TSKDAVID/Chaster_CRM
**Supabase project:** Atomic CRM (`lqpifbarwkmfelbxcxll`)
**Other Supabase project:** chaster (`wribsfzttxmzcioibqpb`) — this is the Python backend, NOT the CRM.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Routing | React Router v7 |
| Data fetching | React Query (TanStack Query) |
| Forms | React Hook Form |
| App framework | shadcn-admin-kit + ra-core (react-admin headless) |
| UI components | Shadcn UI + Radix UI |
| Styling | Tailwind CSS v4 |
| Backend | Supabase (PostgreSQL + Auth + Storage + Edge Functions) |
| Testing | Vitest |

---

## Directory Structure

```
atomic-crm/
├── src/
│   ├── components/
│   │   ├── admin/              # Shadcn Admin Kit (edit freely)
│   │   ├── ui/                 # Shadcn UI components (edit freely)
│   │   └── atomic-crm/         # Main CRM code (~15,000 LOC)
│   │       ├── activity/       # Activity log
│   │       ├── companies/      # Company management
│   │       ├── contacts/       # Contact CRUD, import/export, merge
│   │       ├── dashboard/      # Dashboard widgets
│   │       ├── deals/          # Deal pipeline (Kanban)
│   │       ├── layout/         # App headers, layouts
│   │       ├── messaging/      # Real-time DM chat
│   │       ├── notes/          # Notes with attachments
│   │       ├── portal/         # Customer portal pages
│   │       │   ├── account/
│   │       │   ├── config/     # AI agent & chat widget settings
│   │       │   ├── dashboard/
│   │       │   ├── layout/
│   │       │   ├── staff/      # Portal user management
│   │       │   ├── subscription/
│   │       │   └── usage/
│   │       ├── providers/
│   │       │   ├── supabase/   # Production auth + data provider
│   │       │   └── fakerest/   # Dev/demo fake data provider
│   │       ├── root/           # CRM.tsx — app root + routing
│   │       ├── sales/          # Internal staff management
│   │       ├── settings/       # Settings + profile pages
│   │       └── tasks/          # Task management
├── supabase/
│   ├── functions/              # Edge functions (Deno)
│   │   ├── _shared/            # Shared auth + CORS helpers
│   │   ├── delete_note_attachments/
│   │   ├── merge_contacts/
│   │   ├── portal_users/       # Portal user invite/patch/delete
│   │   ├── postmark/           # Inbound email webhook
│   │   ├── update_password/
│   │   └── users/              # Internal user invite/patch
│   └── migrations/             # All DB migrations in order
├── CLAUDE.md                   # Dev commands and conventions
├── COMMON_ISSUES.md            # Known issues and their fixes
└── PROJECT_CONTEXT.md          # This file
```

---

## Two User Types

### Internal Users (`sales` table)
- Log in at the main app URL
- See: Dashboard, Contacts, Companies, Deals, Sales (staff), Messages, Settings
- Roles: `super_admin`, `admin`, `member`
- Profile cached in localStorage under `CURRENT_SALE_CACHE_KEY`

### Portal Users (`portal_users` table)
- Log in at the same URL but are redirected to `/portal_dashboard`
- See: Dashboard, Subscriptions, Usage, Configuration, Staff, Messages, Account
- Roles: `super_admin`, `admin`, `member` (per company)
- Identified by `userType === "portal"` in auth provider

---

## Role Hierarchy

```
super_admin (rank 3)  →  can manage admins AND members
    admin (rank 2)    →  can promote members, cannot touch admins
       member (rank 1) → no management access
```

**Rules enforced in:**
- `supabase/functions/users/index.ts` — internal users
- `supabase/functions/portal_users/index.ts` — portal users
- `src/components/atomic-crm/sales/SalesList.tsx` — internal UI
- `src/components/atomic-crm/portal/staff/PortalStaffList.tsx` — portal UI

**Database enforcement:**
- Trigger `prevent_last_super_admin_sales()` — can't remove the last super admin
- Trigger `prevent_last_super_admin_portal()` — per company
- Trigger `sync_administrator_from_role()` — keeps `administrator` boolean in sync with `role`

**First signup is always super_admin** — enforced by `handle_new_user()` trigger (migration `20260320120000_fix_signup_super_admin.sql`).

---

## Messaging System

- Tables: `dm_conversations`, `dm_messages`
- Supports: text messages + photo attachments
- Images stored in Supabase Storage `attachments` bucket under `dm/` prefix
- Real-time via Supabase Realtime `postgres_changes` subscriptions
- **Optimistic UI**: messages appear instantly on send with blob URL
- **In-place swap**: when real message comes via realtime, blob URL is preserved (no re-download flash)
- **URL persistence**: selected conversation is in the URL (`/messages/:conversationId`), survives refresh
- **Loading skeletons**: 5 pulsing skeleton items shown while conversations load

**Key files:**
- `src/components/atomic-crm/messaging/useMessages.ts` — fetch + send + realtime
- `src/components/atomic-crm/messaging/MessageBubble.tsx` — renders messages
- `src/components/atomic-crm/messaging/MessageInput.tsx` — input + photo picker + preview
- `src/components/atomic-crm/messaging/ConversationList.tsx` — sidebar with skeletons
- `src/components/atomic-crm/messaging/MessagingPage.tsx` — page layout + URL routing

---

## Auth Provider Details

**File:** `src/components/atomic-crm/providers/supabase/authProvider.ts`

### localStorage cache keys
| Key | Content | Cleared on logout? |
|-----|---------|-------------------|
| `CURRENT_SALE_CACHE_KEY` | User profile (role, type, name, avatar) | Yes |
| `CACHE_TIMESTAMP_KEY` | When profile was cached | Yes |
| `IS_INITIALIZED_CACHE_KEY` | Whether the app has any users | **No** — app-global, not user-specific |

### Profile cache TTL
- 30 seconds in localStorage
- On first access per session, always revalidates from DB in background (ensures role changes propagate after SQL updates)

### Login flow
1. Clear `CURRENT_SALE_CACHE_KEY` (stale profile from previous user)
2. Call `baseAuthProvider.login()`
3. Fetch fresh profile from DB
4. Redirect: portal users → `/portal_dashboard`, internal users → `/`

### canAccess fast path
- Reads profile from localStorage synchronously (avoids DB hit on every sidebar item render)
- Role mapping: `super_admin` → same access as `admin`, `portal_super_admin` → same as `portal_admin`

---

## Database Migrations (in order)

| Migration | What it does |
|-----------|-------------|
| `20240730075029_init_db.sql` | Initial schema: contacts, companies, deals, notes, tasks, tags |
| `20240730075425_init_triggers.sql` | User sync trigger (auth.users → sales) |
| `20240806124555_task_sales_id.sql` | Add sales_id to tasks |
| `20241104153231_sales_policies.sql` | RLS policies for sales table |
| `20251204172855_merge_contacts_function.sql` | Contact merge DB function |
| `20260115150819_snake_case_renaming.sql` | Column renames |
| `20260127140209_imports.sql` | Contact import support |
| `20260128165057_sso_handling.sql` | SSO/OAuth support |
| `20260211194545_app_configuration.sql` | App config table (sectors, stages, etc.) |
| `20260304104600_note_attachments_trigger.sql` | Auto-delete storage on note delete |
| `20260309112831_fix_security_warnings.sql` | RLS security hardening |
| `20260314120000_activity_log_view.sql` | Activity log DB view |
| `20260316120000_customer_portal.sql` | Portal users table, companies link, subscriptions, usage, RLS |
| `20260317120000_internal_messaging.sql` | dm_conversations + dm_messages tables |
| `20260318120000_dm_image_support.sql` | Add image_url column to dm_messages |
| `20260319120000_super_admin_roles.sql` | Role column on sales + portal_users, triggers, realtime publication |
| `20260320120000_fix_signup_super_admin.sql` | First signup → super_admin in handle_new_user trigger |
| `20260321120000_plans_ai_config.sql` | Plans + AI agent config tables |
| `20260322120000_plans_write_policy.sql` | RLS write policy for plans |
| `20260323120000_relax_widget_config_policies.sql` | More permissive widget config RLS |

---

## Edge Functions

| Function | Purpose | Deploy command |
|----------|---------|----------------|
| `users` | Invite/patch/disable internal staff | `npx supabase functions deploy users` |
| `portal_users` | Invite/patch/delete portal users | `npx supabase functions deploy portal_users` |
| `merge_contacts` | Merge two contacts | auto-deployed |
| `postmark` | Inbound email webhook → create contact note | auto-deployed |
| `delete_note_attachments` | Clean up storage on note delete | auto-deployed |
| `update_password` | Allow users to change own password | auto-deployed |

**Always deploy from the `atomic-crm` folder:**
```bash
cd "c:\Users\Sale 2\Desktop\New folder\CRM\atomic-crm"
npx supabase functions deploy users
npx supabase functions deploy portal_users
```
Select project **Atomic CRM** (`lqpifbarwkmfelbxcxll`) when prompted.

---

## Security Fixes Applied (2026-03-17)

| Vulnerability | Fix | File |
|--------------|-----|------|
| SQL injection in merge_contacts | Parameterized query instead of string interpolation | `supabase/functions/merge_contacts/index.ts` |
| CORS wildcard `*` | Reads `ALLOWED_ORIGIN` env var; falls back to `*` if not set | `supabase/functions/_shared/cors.ts` |
| File upload: no type/size validation | MIME whitelist + 10MB limit in postmark webhook | `supabase/functions/postmark/extractAndUploadAttachments.ts` |
| DM image: no validation | Type check + 5MB limit before upload | `src/.../messaging/MessageInput.tsx` |
| Error messages leaking internals | Generic messages returned to client, details only in server logs | `_shared/authentication.ts`, `users`, `portal_users`, `merge_contacts` |
| Weak password policy (6 chars) | Raised to 10 characters minimum | `supabase/functions/portal_users/index.ts` |

**TODO for production:** Set `ALLOWED_ORIGIN` secret in Supabase Dashboard → Edge Functions:
```
ALLOWED_ORIGIN=https://yourdomain.com
```

---

## Performance Fixes Applied (2026-03-17)

| Issue | Fix | File |
|-------|-----|------|
| Deals page full-page reload flash | Removed React.lazy (was lazy-loading entire Deals module) | `src/.../deals/index.ts` |
| Archived deals: 1000 items fetched on load | Deferred query to only run when archive dialog opens | `src/.../deals/DealArchivedList.tsx` |
| lodash full bundle (70KB) in contact list | Changed to specific imports `lodash/difference`, `lodash/union` | `src/.../contacts/ContactListContent.tsx` |
| MessageBubble re-renders on every message | Wrapped with `React.memo` | `src/.../messaging/MessageBubble.tsx` |
| QueryClient recreated on every render (mobile) | Moved `new QueryClient()` outside `MobileAdmin` component | `src/.../root/CRM.tsx` |
| Drag-drop errors silently ignored | Added error handler + optimistic rollback | `src/.../deals/DealListContent.tsx` |
| Load More uses `<a href="#">` | Changed to `<button>` for correct semantics + keyboard access | `src/.../activity/ActivityLogIterator.tsx` |
| Conversation list refetching on every message | Changed realtime subscription from `dm_messages INSERT` to `dm_conversations UPDATE` with 300ms debounce | `src/.../messaging/useConversations.ts` |

---

## Known Remaining Issues / TODO

### Functional
- [ ] Super admin cannot yet manage other admins in some edge cases (need to verify after latest deploy)
- [ ] Portal staff management: confirm promote/demote works end-to-end after edge function redeploy
- [ ] Push all code to GitHub with proper git history (pre-commit hook requires `make` which isn't in PATH on Windows)

### Security (lower priority, not breaking)
- [ ] Set `ALLOWED_ORIGIN` env var in Supabase for production CORS restriction
- [ ] Storage bucket policies allow any authenticated user to read all attachments — no per-user isolation yet
- [ ] Rate limiting on edge functions (not native to Supabase, would need external solution)
- [ ] File uploads from postmark webhook accept any file type (only size-limited)
- [ ] RLS policies on main tables use `(true)` — all internal users see all data (intentional for single-org CRM, but worth revisiting for multi-org)

### Performance (lower priority)
- [ ] N+1 queries in contact merge (fetches tasks/notes/deals individually)
- [ ] Dashboard makes 3 separate count queries — could be one aggregation view
- [ ] Deal Kanban hardcoded 100-item limit per column (silent data loss if >100 deals in one stage)
- [ ] Tasks fetched with `perPage: 1000` — no real pagination
- [ ] Missing `staleTime` config on desktop QueryClient (defaults to 0 = always stale)

### Features (future ideas)
- [ ] Email notifications when staff is promoted/demoted
- [ ] Audit log for role changes
- [ ] Bulk message sending from contact list
- [ ] Read receipts in messaging (foundation exists but fire-and-forget)
- [ ] Image lightbox in messaging (expand to full screen) — click handler exists but no fullscreen overlay yet
- [ ] Mobile messaging optimizations
- [ ] Export deals to CSV (contacts already have this)
- [ ] Deal win/loss analytics dashboard widget

---

## Common Commands

```bash
# Run the app (demo mode, no Supabase needed)
cd "c:\Users\Sale 2\Desktop\New folder\CRM\atomic-crm"
npm run dev

# Deploy edge functions
npx supabase functions deploy users
npx supabase functions deploy portal_users

# Push to GitHub
git add <files>
git commit --no-verify -m "message"   # --no-verify skips make hook (Windows has no make)
git push origin main

# Run SQL migration manually
# Go to: https://supabase.com/dashboard/project/lqpifbarwkmfelbxcxll/sql
# Paste content of the migration file and run
```

---

## Key Files Quick Reference

| What you want to change | File |
|------------------------|------|
| Login/logout/auth logic | `src/.../providers/supabase/authProvider.ts` |
| What users can access (canAccess) | `src/.../providers/commons/canAccess.ts` |
| App routing + page structure | `src/.../root/CRM.tsx` |
| Internal staff list + role management | `src/.../sales/SalesList.tsx` |
| Portal staff list + role management | `src/.../portal/staff/PortalStaffList.tsx` |
| Messaging (send, receive, realtime) | `src/.../messaging/useMessages.ts` |
| Message UI (bubbles, images) | `src/.../messaging/MessageBubble.tsx` |
| Message input + photo picker | `src/.../messaging/MessageInput.tsx` |
| Conversation sidebar + skeletons | `src/.../messaging/ConversationList.tsx` |
| Portal subscription page | `src/.../portal/subscription/SubscriptionPage.tsx` |
| Portal usage dashboard | `src/.../portal/usage/UsageDashboard.tsx` |
| AI agent + chat widget config | `src/.../portal/config/ProductConfigPage.tsx` |
| Internal user edge function | `supabase/functions/users/index.ts` |
| Portal user edge function | `supabase/functions/portal_users/index.ts` |
| Shared CORS headers | `supabase/functions/_shared/cors.ts` |
| Common issues + fixes | `COMMON_ISSUES.md` |
