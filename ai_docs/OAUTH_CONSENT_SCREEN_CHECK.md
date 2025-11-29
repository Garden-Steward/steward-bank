# OAuth Consent Screen Configuration Check

## Authorized Domains

**For localhost development**: You typically DON'T need to add `localhost` to authorized domains. Google allows localhost by default for development.

**Authorized domains are only needed for**:
- Production domains (e.g., `steward.garden`)
- Custom domains used in your app

## What to Check in OAuth Consent Screen

### 1. App Information
- ✅ App name: Set (e.g., "Garden Steward")
- ✅ User support email: Your email
- ✅ Developer contact: Your email

### 2. Scopes (CRITICAL)
- ✅ Must include: `https://www.googleapis.com/auth/photoslibrary.readonly`
- Check: **APIs & Services** → **OAuth consent screen** → **Scopes** tab
- Make sure the scope is listed and checked

### 3. Test Users (if in Testing mode)
- ✅ Your email must be in the test users list
- ✅ Any garden steward emails that will authenticate

### 4. Publishing Status
- **Testing**: Only test users can authenticate (should work for you)
- **In production**: Anyone can authenticate (requires verification for sensitive scopes)

## Redirect URI Configuration

Check your OAuth client (not consent screen):
- **APIs & Services** → **Credentials** → Click "Garden Steward Photos"
- **Authorized redirect URIs** should include:
  - `http://localhost:1337/api/google-photos/oauth-callback` (for dev)
  - `https://your-domain.com/api/google-photos/oauth-callback` (for prod)

## Common Issues

### Issue: "Insufficient scopes" even with correct scope
**Possible causes:**
1. ✅ API not enabled (you've checked - it's enabled)
2. ✅ OAuth client in different project (you've checked - same project)
3. ⚠️ **Scope not properly added to consent screen** ← Check this!
4. ⚠️ **Token generated before scope was added** ← Get fresh token
5. ⚠️ **OAuth consent screen not saved properly** ← Re-save it

## Quick Fix Checklist

1. [ ] Go to **OAuth consent screen** → **Scopes** tab
2. [ ] Verify `https://www.googleapis.com/auth/photoslibrary.readonly` is listed
3. [ ] If not listed, click **Add or Remove Scopes**
4. [ ] Search for "photoslibrary" and select the readonly scope
5. [ ] Click **Update** → **Save and Continue**
6. [ ] Go back and verify it's saved
7. [ ] Get a NEW auth URL: `curl http://localhost:1337/api/google-photos/auth-url`
8. [ ] Complete OAuth flow again to get fresh token
9. [ ] Test with new token

## Why This Matters

Even if the API is enabled, if the scope isn't properly configured in the OAuth consent screen, tokens won't have the scope even if you request it during OAuth.

