const axios = require('axios');

const Mapping = {};

/**
 * Updates Google Maps with latest location tracking data
 */
Mapping.updateGoogleMap = async () => {
  try {
    // Get all active location trackings
    const locations = await strapi.db.query('api::location-tracking.location-tracking').findMany({
      where: {
        publishedAt: { $ne: null }
      },
      populate: ['plant']
    });

    // Format locations for Google Maps with minimal data
    const features = locations.map(loc => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [loc.longitude, loc.latitude]
      },
      properties: {
        title: loc.label || 'Unnamed Location',
        plant_name: loc.plant?.plant_name || 'Unknown Plant'
      }
    }));

    // Create GeoJSON object
    const geojson = {
      type: "FeatureCollection",
      features: features
    };

    // Update Google Maps layer with correct API endpoint
    await axios.post(
      `https://mapsplatform.googleapis.com/v1/maps/${process.env.GOOGLE_MAP_ID}/features:batchInsert`,
      {
        features: features
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY
        }
      }
    );

    console.log('Successfully updated Google Maps with location data');
    return true;

  } catch (error) {
    console.error('Error updating Google Maps:', error);
    return false;
  }
};

module.exports = Mapping;
