const Weather = require('../../config/helpers/weather');
// const gardenMock = require('../mocks/gardenMock');
const weatherMock = require('../mocks/weatherMock');

describe('Weather Helper', () => {

  it('should handle getGardenWeather', async () => {
  
    Weather.retrieveLatestOW = jest.fn().mockResolvedValue(weatherMock);

    const garden = {
      title: 'Gravity Garden',
      openweather_id: 5378538
    }
    console.log('garden: ', garden);
    Weather.getGardenWeather(garden).then((res) => {
      console.log(res)
      expect(res.water).toBe(true);
      expect(res.weather.weather_title).toBe('Mist');
    });
  });
});

