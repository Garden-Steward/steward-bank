const axios = require('axios');

const Weather = {};

Weather.runWeatherCron = async() => {
  const fivehours = (5 * 60) * 60; 
  const unixTime = Math.floor(new Date().getTime() / 1000);
  const gardens = await strapi.services.foragespot.find();
  for (let garden of gardens) {
    console.log('cron garden: ', garden.title);
    if (!garden.openweather_id) { continue; }
    try {
      const weather = await strapi.services.weather.findOne({
        openweather_id: garden.openweather_id,
        _sort: 'dt:desc'
      });
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
  const threedays = (72 * 60) * 60; 
  const unixTime = Math.floor(new Date().getTime() / 1000);
  let weather;
  let weathers = [];
  try {
    weathers = await strapi.services.weather.find({
      openweather_id: garden.openweather_id,
      dt_gt: unixTime-threedays,
      _sort: 'dt:desc'
    });
    weather = weathers[0];
  } catch(err) {
    console.log('error finding weather', err);
  }
  // console.log(unixTime, weather.dt, fivehours);
  if (!weather || unixTime - weather.dt > fivehours) {
    weather = await Weather.retrieveLatestOW(garden, weather);
    weathers.push(weather);
  }
  let water = Weather.needWatering(weathers);
  return {...water, ...weather};
};

Weather.needWatering = (allWeathers) => {
  for (let weatherObj of allWeathers) {
    if (weatherObj.weather_title == 'Rain' || weatherObj.weather_title == 'Mist') {
      return {water: false, lastRain: weatherObj.date, rainDescription: weatherObj.description};
    }
  }
  return {water: true};
};

Weather.retrieveLatestOW = async(garden, latestWeather) => {
  const openWeather = await Weather.getOpenWeather(garden);
  if (latestWeather && openWeather.dt === latestWeather.dt){
    // Open weather has stale weather data for over 5 hours
    return latestWeather;
  }

  console.log('got new openweather: ', openWeather.main);
  return strapi.services.weather.create({
    date: new Date(),
    dt: openWeather.dt,
    openweather_id: openWeather.id,
    weather_title: openWeather.weather[0].main,
    description: openWeather.weather[0].description,
    temp_min: openWeather.main.temp_min,
    temp_max: openWeather.main.temp_max,
    json: openWeather,
    gardens: [garden]
  });
 
};

Weather.getOpenWeather = async(garden) => {
  try {
    const {data} = await axios.get(`https://api.openweathermap.org/data/2.5/weather?lat=${garden.latitude}&lon=${garden.longitude}&units=imperial&appid=${process.env.WEATHER_API}`);
    return data;
  } catch (err) {
    console.error(err);
  }
  
};

module.exports = Weather;
