#!/bin/bash

# Test script for Google Photos integration
# Usage: ./test-google-photos-flow.sh YOUR_ACCESS_TOKEN YOUR_ALBUM_ID

ACCESS_TOKEN=$1
ALBUM_ID=$2
BASE_URL="http://localhost:1337"

if [ -z "$ACCESS_TOKEN" ]; then
  echo "❌ Error: Access token required"
  echo "Usage: ./test-google-photos-flow.sh YOUR_ACCESS_TOKEN YOUR_ALBUM_ID"
  exit 1
fi

if [ -z "$ALBUM_ID" ]; then
  echo "⚠️  Warning: No album ID provided. Testing auth URL only."
  echo ""
  echo "To get an album ID:"
  echo "1. Open a Google Photos shared album"
  echo "2. Extract the album ID from the URL"
  echo "   Example: https://photos.app.goo.gl/ALBUM_ID"
  echo ""
  exit 0
fi

echo "🧪 Testing Google Photos Integration"
echo "=================================="
echo ""

# Test 1: List photos from album
echo "1️⃣  Testing: List photos from album"
echo "   Album ID: $ALBUM_ID"
echo ""

RESPONSE=$(curl -s -X POST \
  "$BASE_URL/api/google-photos/album/$ALBUM_ID/photos" \
  -H "Content-Type: application/json" \
  -d "{\"accessToken\": \"$ACCESS_TOKEN\"}")

if echo "$RESPONSE" | grep -q "photos"; then
  echo "✅ Success! Photos retrieved"
  PHOTO_COUNT=$(echo "$RESPONSE" | grep -o '"id"' | wc -l | tr -d ' ')
  echo "   Found $PHOTO_COUNT photos"
  echo ""
  echo "📋 Sample response (first photo):"
  echo "$RESPONSE" | head -20
else
  echo "❌ Error retrieving photos:"
  echo "$RESPONSE"
fi

echo ""
echo "=================================="
echo ""
echo "💡 Next steps:"
echo "   1. Review the photos list above"
echo "   2. Select photo IDs you want to import"
echo "   3. Test import with:"
echo "      curl -X POST $BASE_URL/api/google-photos/import \\"
echo "        -H 'Content-Type: application/json' \\"
echo "        -d '{\"accessToken\": \"$ACCESS_TOKEN\", \"photos\": [{\"id\": \"...\", \"baseUrl\": \"...\", \"filename\": \"...\", \"mimeType\": \"...\"}]}'"

