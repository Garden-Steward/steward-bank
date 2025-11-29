# Google Photos Integration Troubleshooting

## Error: "Request had insufficient authentication scopes"

This error means your access token doesn't have the required `photoslibrary.readonly` scope.

### Solution: Re-authenticate

The token you received might not have been granted the correct scope. You need to re-authenticate:

1. **Get a new authorization URL:**
   ```bash
   curl http://localhost:1337/api/google-photos/auth-url
   ```

2. **Open the URL in your browser** and make sure to:
   - Sign in with the Google account that has access to the albums
   - **Carefully review the permissions screen**
   - Make sure you see "See your Google Photos" permission
   - Click "Allow" or "Continue"

3. **Complete the OAuth flow** and get new tokens

4. **Verify the token has the scope:**
   The token response should include:
   ```json
   {
     "scope": "https://www.googleapis.com/auth/photoslibrary.readonly"
   }
   ```

### Common Causes

1. **User didn't grant the scope**: During OAuth, the user might have denied the Photos permission
2. **Token expired**: Access tokens expire after ~1 hour
3. **Wrong account**: Authenticated with a different Google account than the one with album access
4. **OAuth consent screen not configured**: The scope might not be properly configured in Google Cloud Console

### Check Your OAuth Consent Screen

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **OAuth consent screen**
3. Check **Scopes** section
4. Make sure `https://www.googleapis.com/auth/photoslibrary.readonly` is listed
5. If not, add it and save

### Verify Token Scope

You can check what scopes your token has:

```bash
curl "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=YOUR_ACCESS_TOKEN"
```

Look for the `scope` field in the response. It should include `https://www.googleapis.com/auth/photoslibrary.readonly`.

### Quick Fix: Get New Token

1. Visit: `http://localhost:1337/api/google-photos/auth-url`
2. Copy the `authUrl` from the response
3. Open it in your browser
4. **Make sure to grant the Photos permission**
5. Complete the OAuth flow
6. Use the new access token

### Still Having Issues?

- Check that the Photos Library API is enabled in Google Cloud Console
- Verify your OAuth client ID and secret are correct
- Make sure you're using the same Google account that has access to the albums
- Check the Strapi server logs for more detailed error messages

