# Manual Photo Upload Workflow

## Overview

While Google Photos API verification is in progress, you can use manual photo uploads to add photos to Projects and Volunteer Days. The `featured_gallery` fields support multiple image uploads directly through Strapi's media library.

## How to Use Manual Uploads

### For Projects

1. **Create or Edit a Project** in Strapi Admin
2. **Scroll to "Featured Gallery"** field
3. **Click "Add an entry"** or the upload button
4. **Upload photos**:
   - Drag and drop images
   - Or click to browse and select files
   - You can upload multiple photos at once
5. **Optionally add album URL**: 
   - In the "Photo Album URL" field, paste the Google Photos share link
   - The album ID will be automatically extracted and saved
   - This allows you to switch to API import later once verified
6. **Save the Project**

### For Volunteer Days

1. **Create or Edit a Volunteer Day** in Strapi Admin
2. **Scroll to "Featured Gallery"** field
3. **Upload photos** (same process as Projects)
4. **Optionally add album URL** for future reference
5. **Save the Volunteer Day**

## Photo Requirements

- **Supported formats**: JPG, PNG, GIF, WebP
- **Recommended size**: Under 10MB per image
- **Recommended dimensions**: 1920x1080 or larger for best quality
- **Multiple photos**: You can upload 3-8 photos for the featured gallery

## Workflow Tips

### Organizing Photos Before Upload

1. **Select your best photos** (3-8 images)
2. **Name files descriptively** (e.g., `earth-day-2025-1.jpg`)
3. **Resize if needed** (optional, Strapi will handle optimization)
4. **Upload in order** (first uploaded = first displayed)

### Using Album URLs for Future Reference

Even with manual uploads, you can:
- Paste the Google Photos album URL in the `photo_album_url` field
- The album ID will be automatically extracted
- Once Google Photos API is verified, you can use the "Import from Google Photos" feature
- This keeps your data ready for the API integration

## Switching to Google Photos API Later

Once Google Photos API verification is complete:

1. The existing `photo_album_url` fields will already have album IDs extracted
2. You can use the Google Photos import endpoints to:
   - List photos from albums
   - Import selected photos to replace or supplement manual uploads
3. The `featured_gallery` field will work the same way - just with photos imported from Google Photos instead of manually uploaded

## Current Status

✅ **Manual uploads**: Fully functional  
⏳ **Google Photos API**: Awaiting verification  
📝 **Album URL storage**: Working (extracts IDs for future use)

## Best Practices

1. **Upload high-quality photos** - Strapi will optimize them automatically
2. **Use descriptive filenames** - Helps with organization
3. **Keep album URLs** - Even if using manual uploads, storing the URL helps for future API integration
4. **Limit gallery size** - 3-8 photos is ideal for featured galleries
5. **Use hero images** - Set a single `hero_image` for the main project/event photo

## Troubleshooting

### Photos not uploading?
- Check file size (should be under 10MB)
- Verify file format is supported
- Check Strapi media library permissions

### Album ID not extracting?
- Verify the URL format is correct
- Check the lifecycle hooks are running (restart Strapi if needed)
- The album ID will be in the `photo_album_id` field after saving

### Want to switch photos later?
- You can always replace photos in the `featured_gallery` field
- Or add more photos to the existing gallery
- The Google Photos import will be available once API is verified

