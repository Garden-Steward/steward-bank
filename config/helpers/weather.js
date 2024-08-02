const axios = require('axios');
const { addDays } = require('date-fns');

const Weather = {};

Weather.runWeatherCron = async() => {
  const fivehours = (5 * 60) * 60; 
  const unixTime = Math.floor(new Date().getTime() / 1000);
  const gardens = await strapi.db.query('api::garden.garden').findMany({});
  
  for (let garden of gardens) {
    console.log('cron garden: ', garden.title);
    if (!garden.openweather_id || !garden.latitude || !garden.latitude) { continue; }
    try {
      const weather = await strapi.db.query('api::weather.weather').findOne({
        where: {openweather_id: garden.openweather_id},
        orderBy: {dt: 'DESC'}
      });
      if (!weather) {
        console.log("NO WEATHER WITH OPENWEATHER ID: ", garden.openweather_id)
      }
      if (!weather || unixTime - weather.dt > fivehours) {
        console.log('Adding new weather');
        await Weather.retrieveLatestOW(garden, weather);
      }
    } catch(err) {
      console.log('error finding weather', err);
    }
  
  }

};

Weather.getGardenWeather = async(garden) => {
  //
  const fivehours = (5 * 60) * 60; 
  const unixTime = Math.floor(new Date().getTime() /1000);
  const threeDaysAgo = addDays(new Date(),-3)
  let weather;
  let weathers = [];
  let threeDaysAgoUnix = Math.floor(threeDaysAgo.getTime()/1000)
  
  try {
    weathers = await strapi.db.query('api::weather.weather').findMany({
      where: {
        openweather_id: garden.openweather_id,
        dt: {
          $gt: threeDaysAgoUnix
        }
      },
      orderBy: { dt: 'DESC'}
    });
    console.log(`getGardenWeather found ${weathers.length} weathers`);
    weather = weathers[0];
  } catch(err) {
    console.log('error finding weather', err);
  }
  if (!weather || unixTime - weather.dt > fivehours) {
    weather = await Weather.retrieveLatestOW(garden, weather);
    weathers.push(weather);
  }
  let water = Weather.needWatering(weathers);
  return {...water, ...weather};
};

Weather.needWatering = (allWeathers) => {
  let waterEvents = []
  for (let weatherObj of allWeathers) {
    // Weather Titles: 'Mist', 'Rain, 'Clouds'
    if (weatherObj.weather_title == 'Rain') {
      const recentRain = new Date(weatherObj.date);
      waterEvents.push({water: false, recentRain: recentRain, rainDescription: weatherObj.description});
    }
  }
  if (waterEvents.length == 1) {
    return {water: false, reason: `${waterEvents[0].rainDescription} on ${waterEvents[0].recentRain.toDateString()}`};
  } else if (waterEvents.length > 1) {
    return {water: false, reason: `Multiple rain events starting on ${waterEvents[0].recentRain.toDateString()}`}
  }
  return {water: true};
};

Weather.retrieveLatestOW = async(garden, latestWeather) => {
  const openWeather = await Weather.getOpenWeather(garden);
  if (latestWeather && openWeather.dt === latestWeather.dt){
    // Open weather has stale weather data for over 5 hours
    return latestWeather;
  }

  // console.log('got new openweather: ', openWeather.main);
  return strapi.db.query('api::weather.weather').create({
    data: {
      date: new Date(),
      dt: openWeather.dt,
      openweather_id: openWeather.id,
      weather_title: openWeather.weather[0].main,
      description: openWeather.weather[0].description,
      temp_min: openWeather.main.temp_min,
      temp_max: openWeather.main.temp_max,
      json: openWeather
    }
  });
 
};

Weather.getOpenWeather = async(garden) => {
  try {
    const {data} = await axios.get(`https://api.openweathermap.org/data/2.5/weather?lat=${garden.latitude}&lon=${garden.longitude}&units=imperial&appid=${process.env.WEATHER_API}`);
    return data;
  } catch (err) {
    if (err.data) {
      console.error(data);
    } else {
      console.error(err);
    }
  }
  
};

module.exports = Weather;
