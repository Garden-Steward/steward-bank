#!/usr/bin/env node

/**
 * Test script for Google Photos integration
 * Run with: node test-google-photos.js
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:1337';

async function testGooglePhotosSetup() {
  console.log('🧪 Testing Google Photos Integration\n');
  console.log('=' .repeat(50));

  // Test 1: Check if Strapi is running
  console.log('\n1️⃣  Checking if Strapi is running...');
  try {
    const healthCheck = await axios.get(`${BASE_URL}/_health`, { timeout: 5000 });
    console.log('✅ Strapi is running');
  } catch (error) {
    console.log('❌ Strapi is not running. Please start it with: npm run develop');
    process.exit(1);
  }

  // Test 2: Get authorization URL
  console.log('\n2️⃣  Testing authorization URL endpoint...');
  try {
    const response = await axios.get(`${BASE_URL}/api/google-photos/auth-url`);
    
    if (response.data.authUrl) {
      console.log('✅ Authorization URL generated successfully');
      console.log('\n📋 Your authorization URL:');
      console.log(response.data.authUrl);
      console.log('\n👉 Next steps:');
      console.log('   1. Copy the URL above');
      console.log('   2. Open it in your browser');
      console.log('   3. Grant permissions to access Google Photos');
      console.log('   4. You will be redirected with a code parameter');
      console.log('   5. Use that code to get tokens via:');
      console.log(`      GET ${BASE_URL}/api/google-photos/oauth-callback?code=YOUR_CODE`);
    } else {
      console.log('❌ No authUrl in response:', response.data);
    }
  } catch (error) {
    if (error.response) {
      console.log('❌ Error:', error.response.status, error.response.data);
      if (error.response.status === 500) {
        console.log('\n💡 Common issues:');
        console.log('   - Check that GOOGLE_CLIENT_ID is set in .env');
        console.log('   - Check that GOOGLE_CLIENT_SECRET is set in .env');
        console.log('   - Verify credentials are correct');
      }
    } else if (error.code === 'ECONNREFUSED') {
      console.log('❌ Cannot connect to Strapi. Is it running?');
    } else {
      console.log('❌ Error:', error.message);
    }
    process.exit(1);
  }

  console.log('\n' + '='.repeat(50));
  console.log('\n✅ Basic setup test complete!');
  console.log('\n📝 To test the full OAuth flow:');
  console.log('   1. Open the authorization URL in your browser');
  console.log('   2. Complete the OAuth consent');
  console.log('   3. Copy the code from the redirect URL');
  console.log('   4. Test token exchange with:');
  console.log('      curl "http://localhost:1337/api/google-photos/oauth-callback?code=YOUR_CODE"');
}

// Run the tests
testGooglePhotosSetup().catch(console.error);

