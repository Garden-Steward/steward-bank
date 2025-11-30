# Google Photos Token Storage Guide

## ⚠️ Important: Store Your Tokens Securely

You've received OAuth tokens. **Store them securely** - never commit them to git!

## Your Tokens

```json
{
  "access_token": "YOUR_ACCESS_TOKEN_HERE",
  "refresh_token": "YOUR_REFRESH_TOKEN_HERE",
  "expiry_date": 1764368057031
}
```

## Token Information

- **Access Token**: Valid for ~1 hour (expires at: 2025-11-28 14:12:37 UTC)
- **Refresh Token**: Long-lived, use to get new access tokens
- **Expiry**: Access tokens expire, refresh tokens don't

## Quick Test

To test listing photos from an album, you need:

1. **An album ID** from a Google Photos shared album
2. **Your access token** (from above)

### Getting an Album ID

1. Open a Google Photos shared album in your browser
2. The URL will look like one of these:
   - `https://photos.app.goo.gl/ALBUM_ID`
   - `https://photos.google.com/share/ALBUM_ID`
   - `https://photos.google.com/album/ALBUM_ID`

3. Extract the album ID from the URL

### Test Command

```bash
# Replace ALBUM_ID with your actual album ID
curl -X POST http://localhost:1337/api/google-photos/album/ALBUM_ID/photos \
  -H "Content-Type: application/json" \
  -d '{
    "accessToken": "YOUR_ACCESS_TOKEN_HERE"
  }'
```

## Production Token Storage

For production, you should:

1. **Store tokens in database** (encrypted)
2. **Associate with user** (who authenticated)
3. **Implement token refresh** (before access token expires)
4. **Never log tokens** in production

### Example Token Storage Structure

```javascript
// Pseudo-code for token storage
{
  userId: 123,  // Strapi user ID
  accessToken: 'encrypted_access_token',
  refreshToken: 'encrypted_refresh_token',
  expiresAt: '2025-11-28T14:12:37Z',
  createdAt: '2025-11-28T13:12:37Z'
}
```

## Token Refresh

When the access token expires, use the refresh token to get a new one:

```javascript
// This would be implemented in the Google Photos service
const oauth2Client = new google.auth.OAuth2(...);
oauth2Client.setCredentials({ refresh_token: storedRefreshToken });
const { credentials } = await oauth2Client.refreshAccessToken();
// credentials.access_token is the new token
```

## Security Best Practices

1. ✅ **Encrypt tokens** before storing in database
2. ✅ **Use HTTPS** in production
3. ✅ **Rotate tokens** if compromised
4. ✅ **Limit token scope** (you're using readonly, which is good)
5. ✅ **Monitor token usage** for suspicious activity
6. ❌ **Never commit tokens** to git
7. ❌ **Don't log tokens** in production logs
8. ❌ **Don't expose tokens** in API responses

## Next Steps

1. Test listing photos from an album
2. Test importing photos to Strapi
3. Implement secure token storage
4. Add token refresh logic
5. Add user association (who owns these tokens)

