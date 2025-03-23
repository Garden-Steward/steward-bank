const fs = require('fs');
const path = require('path');
const readline = require('readline');
const axios = require('axios');
const stream = require('stream');
const { promisify } = require('util');
const finished = promisify(stream.finished);

/**
 * Downloads a file from a URL and saves it to the specified path
 */
async function downloadFile(fileUrl, outputPath) {
  if (!fileUrl.startsWith('http')) {
    console.log(`Skipping local file: ${fileUrl}`);
    return false;
  }

  const writer = fs.createWriteStream(outputPath);
  try {
    const response = await axios({
      method: 'GET',
      url: fileUrl,
      responseType: 'stream'
    });
    

    response.data.pipe(writer);
    await finished(writer);
    return true;
  } catch (error) {
    console.error(`Error downloading file ${fileUrl}:`, error.message);
    writer.close();
    return false;
  }
}

/**
 * Process a single media entity
 */
async function processMediaEntity(entity, uploadDir) {
  const { data } = entity;
  
  // Create directories if they don't exist
  const fileDir = path.join(uploadDir, data.folderPath || '');
  fs.mkdirSync(fileDir, { recursive: true });

  // Download original file
  const fileName = data.hash + data.ext;
  const filePath = path.join(fileDir, fileName);
  
  const downloaded = await downloadFile(data.url, filePath);

  // Download format versions if they exist
  if (data.formats) {
    for (const [format, formatData] of Object.entries(data.formats)) {
      const formatFileName = `${format}_${fileName}`;
      const formatFilePath = path.join(fileDir, formatFileName);
      await downloadFile(formatData.url, formatFilePath);
    }
  }

  // Prepare the entity for database insertion
  const mediaEntry = {
    name: data.name,
    alternativeText: data.alternativeText,
    caption: data.caption,
    width: data.width,
    height: data.height,
    formats: data.formats,
    hash: data.hash,
    ext: data.ext,
    mime: data.mime,
    size: data.size,
    url: downloaded ? `/${fileName}` : data.url,
    previewUrl: data.previewUrl,
    provider: data.provider,
    provider_metadata: data.provider_metadata,
    folderPath: data.folderPath || '/',
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };

  return mediaEntry;
}

const basicMediaData = [
  {
    "type": "plugin::upload.file",
    "id": 1,
    "data": {
      "name": "earthday-team.jpg",
      "alternativeText": null,
      "caption": null,
      "width": 1400,
      "height": 788,
      "hash": "earthday_team",
      "ext": ".jpg",
      "mime": "image/jpeg",
      "size": 319.83,
      "url": "/uploads/earthday_team.jpg",
      "provider": "local",
      "folderPath": "/",
      "createdAt": "2023-12-19T02:44:23.325Z",
      "updatedAt": "2023-12-19T02:49:11.933Z"
    }
  },
  {
    "type": "plugin::upload.file",
    "id": 2,
    "data": {
      "name": "community-garden.jpg",
      "alternativeText": null,
      "caption": null,
      "width": 1600,
      "height": 900,
      "hash": "community_garden",
      "ext": ".jpg",
      "mime": "image/jpeg",
      "size": 392.26,
      "url": "/uploads/community_garden.jpg",
      "provider": "local",
      "folderPath": "/",
      "createdAt": "2024-01-12T02:02:34.945Z",
      "updatedAt": "2024-01-12T02:02:34.945Z"
    }
  },
  {
    "type": "plugin::upload.file",
    "id": 3,
    "data": {
      "name": "garden-harvest.jpg",
      "alternativeText": null,
      "caption": null,
      "width": 1600,
      "height": 1021,
      "hash": "garden_harvest",
      "ext": ".jpg",
      "mime": "image/jpeg",
      "size": 324.52,
      "url": "/uploads/garden_harvest.jpg",
      "provider": "local",
      "folderPath": "/",
      "createdAt": "2024-02-26T20:40:07.923Z",
      "updatedAt": "2024-02-26T21:08:57.467Z"
    }
  }
];

/**
 * Main function to seed media files
 */
async function seedMedia(strapi) {
  console.log('Starting basic media seeding...');

  try {
    // Set up upload directory
    const uploadDir = path.join(process.cwd(), 'public/uploads');
    fs.mkdirSync(uploadDir, { recursive: true });

    const mediaEntries = await Promise.all(basicMediaData.map(async (mediaItem) => {
      return await processMediaEntity(mediaItem, uploadDir);
    }));

    // Batch insert media entries
    for (const entry of mediaEntries) {
      await strapi.entityService.create('plugin::upload.file', {
        data: entry
      });
    }
    console.log(`Successfully seeded ${mediaEntries.length} media files`);
  } catch (error) {
    console.error('Error inserting media entries:', error);
  }
}

module.exports = seedMedia; 