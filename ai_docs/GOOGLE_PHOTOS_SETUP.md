# Google Photos API Setup Guide

This guide walks you through setting up Google Photos Library API access for Garden Steward.

## Prerequisites

- A Google account
- Access to Google Cloud Console
- Your Strapi backend running (for testing redirect URIs)

## Step-by-Step Setup

### Step 1: Create or Select a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. If you don't have a project:
   - Click the project dropdown at the top
   - Click "New Project"
   - Enter project name: `Garden Steward` (or your preferred name)
   - Click "Create"
3. If you already have a project, select it from the dropdown

### Step 2: Enable the Photos Library API

1. In the Google Cloud Console, go to **APIs & Services** → **Library**
2. Search for "Photos Library API"
3. Click on "Photos Library API" from the results
4. Click the **Enable** button
5. Wait for the API to be enabled (this may take a minute)

### Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **User Type**:
   - **Internal**: Only for users within your Google Workspace organization
   - **External**: For any Google user (choose this if you don't have Google Workspace)
   - Click **Create**

3. Fill in the **App information**:
   - **App name**: `Garden Steward` (or your preferred name)
   - **User support email**: Your email address
   - **App logo**: (Optional) Upload a logo if you have one
   - **Application home page**: Your website URL (e.g., `https://steward.garden`)
   - **Application privacy policy link**: (Optional but recommended)
   - **Application terms of service link**: (Optional)
   - **Authorized domains**: Add your domain (e.g., `steward.garden`)
   - **Developer contact information**: Your email address
   - Click **Save and Continue**

4. **Scopes** (Step 2):
   - Click **Add or Remove Scopes**
   - Search for and select: `https://www.googleapis.com/auth/photoslibrary.readonly`
   - Click **Update** → **Save and Continue**

5. **Test users** (Step 3 - only if External):
   - If you chose "External", add test users who will authenticate
   - Add your own email address and any garden steward emails
   - Click **Save and Continue**

6. **Summary** (Step 4):
   - Review your settings
   - Click **Back to Dashboard**

### Step 4: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **OAuth client ID**
3. If prompted, select **Web application** as the application type
4. Fill in the form:
   - **Name**: `Garden Steward Backend` (or your preferred name)
   - **Authorized JavaScript origins**: 
     - For development: `http://localhost:1337`
     - For production: `https://your-production-domain.com`
   - **Authorized redirect URIs**:
     - For development: `http://localhost:1337/api/google-photos/oauth-callback`
     - For production: `https://your-production-domain.com/api/google-photos/oauth-callback`
   - Click **Create**

5. **Important**: A popup will appear with your credentials:
   - **Client ID**: Copy this immediately (you won't see it again!)
   - **Client secret**: Copy this immediately (you won't see it again!)
   - Click **OK**

### Step 5: Save Your Credentials

⚠️ **IMPORTANT**: Save these credentials securely. You can view the Client ID again later, but the Client Secret is only shown once.

1. Copy your **Client ID** and **Client Secret**
2. Add them to your `.env` file:

```bash
# Google Photos API Credentials
GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:1337/api/google-photos/oauth-callback
```

3. **Never commit these to git!** Make sure `.env` is in your `.gitignore`

### Step 6: Verify Your Setup

1. Restart your Strapi server:
   ```bash
   npm run develop
   ```

2. Test the authorization URL endpoint:
   ```bash
   curl http://localhost:1337/api/google-photos/auth-url
   ```

   You should get a response like:
   ```json
   {
     "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?..."
   }
   ```

3. Open the `authUrl` in your browser
4. You should see the Google OAuth consent screen
5. Grant permissions
6. You'll be redirected to your callback URL with a `code` parameter

### Step 7: Production Setup

When deploying to production:

1. **Update OAuth Consent Screen**:
   - Go back to **OAuth consent screen**
   - If you're ready for production, click **Publish App**
   - Note: This may require verification if you're requesting sensitive scopes

2. **Add Production Redirect URI**:
   - Go to **Credentials** → Your OAuth client
   - Click **Edit**
   - Add your production redirect URI:
     - `https://your-production-domain.com/api/google-photos/oauth-callback`
   - Click **Save**

3. **Update Environment Variables**:
   - Set `GOOGLE_REDIRECT_URI` to your production URL
   - Update in your hosting platform's environment variables

## Troubleshooting

### "Redirect URI mismatch" Error

- Make sure the redirect URI in your `.env` exactly matches one in Google Cloud Console
- Check for trailing slashes, `http` vs `https`, and port numbers
- The redirect URI must be in the "Authorized redirect URIs" list

### "Access blocked: This app's request is invalid" Error

- Check that the Photos Library API is enabled
- Verify the OAuth consent screen is configured
- Make sure you're using the correct Client ID

### "Invalid client" Error

- Verify your Client ID and Client Secret are correct
- Make sure there are no extra spaces when copying
- Check that the credentials are in your `.env` file

### Can't See Photos in Shared Album

- The authenticated user must have access to the album
- The album must be shared with the authenticated user's Google account
- Try accessing the album directly in Google Photos first to verify access

## Security Best Practices

1. **Never commit credentials to git**
2. **Use environment variables** for all sensitive data
3. **Rotate credentials** if they're ever exposed
4. **Limit OAuth scope** to only what's needed (`photoslibrary.readonly`)
5. **Store tokens securely** in production (encrypted database, not plain text)
6. **Implement token refresh** logic for long-lived sessions

## Next Steps

Once setup is complete:

1. Test the OAuth flow end-to-end
2. Implement secure token storage (see `GOOGLE_PHOTOS_INTEGRATION.md`)
3. Add error handling and user feedback
4. Set up token refresh logic
5. Add rate limiting to protect against abuse

## Additional Resources

- [Google Photos Library API Documentation](https://developers.google.com/photos/library/guides/overview)
- [OAuth 2.0 for Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google Cloud Console](https://console.cloud.google.com/)

