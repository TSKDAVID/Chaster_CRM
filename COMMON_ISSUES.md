# Common Issues & Solutions

## Edge Function Deploy Fails: "Entrypoint path does not exist"

**Error:**
```
WARN: failed to read file: open supabase\functions\users\index.ts: The system cannot find the path specified.
unexpected deploy status 400: {"message":"Entrypoint path does not exist..."}
```

**Cause:** Running the deploy command from the wrong directory. The CLI needs to find the `supabase/` folder relative to your current working directory.

**Fix:** Always `cd` into the `atomic-crm` folder first:
```bash
cd "c:\Users\Sale 2\Desktop\New folder\CRM\atomic-crm"
npx supabase functions deploy users
npx supabase functions deploy portal_users
```

**Project:** Select "Atomic CRM" (`lqpifbarwkmfelbxcxll`) when prompted.

---

## Blank Page After Logout (dark background with `#` in URL)

**Cause:** The logout function was clearing the `IS_INITIALIZED_CACHE_KEY` from localStorage. After logout, `checkAuth` re-queried the database without a session, which failed and redirected to `/sign-up` instead of `/login`.

**Fix:** Don't clear `IS_INITIALIZED_CACHE_KEY` on logout — it's app-global (whether the app has any users), not user-specific. Only clear user-specific caches (`CURRENT_SALE_CACHE_KEY`, `CACHE_TIMESTAMP_KEY`, `@react-admin/nextPathname`).

**File:** `src/components/atomic-crm/providers/supabase/authProvider.ts` → `clearCache()`

---

## Role Changes (via SQL) Not Reflected in UI

**Cause:** The user profile is cached in localStorage with a 30-second TTL. If you update a role directly in SQL, the UI won't reflect it until the cache expires.

**Fix:** The app now forces a background revalidation from the database on every page load (first access per session). After changing a role via SQL, just refresh the page.

**File:** `src/components/atomic-crm/providers/supabase/authProvider.ts` → `getUserProfile()`

---

## Staff Management Actions Not Showing

**Cause:** The dropdown actions (promote/demote) were gated behind `callerRank >= 3` (super admin only), preventing admins from promoting members.

**Fix:** Updated the dropdown visibility logic so:
- Super admins can manage everyone (promote/demote admins and members)
- Admins can promote members to admin
- Admins cannot demote other admins (only super admins can)

**Files:**
- `src/components/atomic-crm/portal/staff/PortalStaffList.tsx`
- `src/components/atomic-crm/sales/SalesList.tsx`
- `supabase/functions/users/index.ts`
- `supabase/functions/portal_users/index.ts`

---

## SQL Migrations Not Applied

If features aren't working after code changes, you may need to run SQL migrations manually in the Supabase Dashboard → SQL Editor:

1. **Image support:** `supabase/migrations/20260318120000_dm_image_support.sql`
2. **Role hierarchy:** `supabase/migrations/20260319120000_super_admin_roles.sql`
3. **First signup = super admin:** `supabase/migrations/20260320120000_fix_signup_super_admin.sql`

After running migrations, redeploy edge functions:
```bash
cd "c:\Users\Sale 2\Desktop\New folder\CRM\atomic-crm"
npx supabase functions deploy users
npx supabase functions deploy portal_users
```

---

## Security Audit Fixes Applied (2026-03-16)

| Fix | File |
|-----|------|
| SQL injection: parameterized query in merge_contacts | `supabase/functions/merge_contacts/index.ts` |
| CORS: wildcard `*` replaced with `ALLOWED_ORIGIN` env var | `supabase/functions/_shared/cors.ts` |
| File upload: MIME whitelist + 10MB size limit | `supabase/functions/postmark/extractAndUploadAttachments.ts` |
| DM image: type + 5MB size validation on client | `src/.../messaging/MessageInput.tsx` |
| Info disclosure: generic error messages in all edge functions | `_shared/authentication.ts`, `merge_contacts`, `users`, `portal_users` |
| Password policy: minimum 10 characters | `supabase/functions/portal_users/index.ts` |

**CORS setup for production:** Add `ALLOWED_ORIGIN` secret in Supabase Dashboard > Edge Functions:
```
ALLOWED_ORIGIN=https://yourdomain.com
```

---

## Performance Fixes Applied (2026-03-16)

| Fix | File |
|-----|------|
| Removed React.lazy from Deals (eliminated loading flash) | `src/.../deals/index.ts` |
| Deferred archived deals query (only on dialog open) | `src/.../deals/DealArchivedList.tsx` |
| Fixed lodash full-bundle import | `src/.../contacts/ContactListContent.tsx` |
| Memoized MessageBubble (prevents re-renders) | `src/.../messaging/MessageBubble.tsx` |
| Moved QueryClient outside MobileAdmin component | `src/.../root/CRM.tsx` |
| Added error handling + rollback for deal drag-drop | `src/.../deals/DealListContent.tsx` |
| Fixed Load More accessibility (button instead of link) | `src/.../activity/ActivityLogIterator.tsx` |
