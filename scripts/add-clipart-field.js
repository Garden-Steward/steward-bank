#!/usr/bin/env node
/**
 * Adds the `clipart` media field to the Plant content type on the production Strapi instance.
 *
 * Usage:
 *   ADMIN_EMAIL=cameron@oufp.org ADMIN_PASSWORD=*** node scripts/add-clipart-field.js
 *
 * This uses Strapi v4's Content-Type Builder API via the admin interface.
 */

const axios = require('axios');
const API_URL = process.env.API_URL || 'https://steward-bank.fly.dev';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function getAdminJwt() {
  const res = await axios.post(`${API_URL}/admin/login`, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  return res.data.data.token;
}

async function addClipartField() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('ERROR: ADMIN_EMAIL and ADMIN_PASSWORD env vars are required');
    process.exit(1);
  }

  console.log('Authenticating to Strapi admin...');
  const token = await getAdminJwt();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // First, get the current content type schema to find the UID
  console.log('Fetching current content types...');
  const ctRes = await axios.get(`${API_URL}/content-type-builder/content-types`, { headers });
  const contentTypes = ctRes.data?.data;
  if (!Array.isArray(contentTypes)) {
    console.error('ERROR: Unexpected response from content-type-builder API');
    console.error('Expected JSON with a data array; got:', typeof ctRes.data);
    process.exit(1);
  }

  const plantCT = contentTypes.find(ct => ct.schema.singularName === 'plant');
  if (!plantCT) {
    console.error('ERROR: Plant content type not found!');
    process.exit(1);
  }

  const plantUID = plantCT.uid;
  console.log(`Found plant content type UID: ${plantUID}`);

  // Check if clipart already exists
  if (plantCT.schema.attributes.clipart) {
    console.log('✅ clipart field already exists on the Plant content type. Nothing to do.');
    return;
  }

  // Add the clipart field via Content-Type Builder API
  console.log('Adding clipart media field...');
  await axios.put(
    `${API_URL}/content-type-builder/content-types/${plantUID}`,
    {
      contentType: {
        ...plantCT.schema,
        attributes: {
          ...plantCT.schema.attributes,
          clipart: {
            type: 'media',
            multiple: false,
            required: false,
            allowedTypes: ['images'],
          }
        }
      }
    },
    { headers }
  );

  console.log('✅ clipart field added successfully!');
  console.log('The Strapi server will restart automatically to apply the change.');
}

addClipartField().catch(err => {
  console.error('Error:', err.response?.data?.error || err.message);
  process.exit(1);
});