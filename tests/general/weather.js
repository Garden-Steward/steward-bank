const Weather = require('../../config/helpers/weather');
// const gardenMock = require('../mocks/gardenMock');
const weatherMock = require('../mocks/weatherMock');
const { patch } = require('../helpers/patch');

describe('Weather Helper', () => {

  it('should handle getGardenWeather', async () => {
  
    patch(Weather, 'retrieveLatestOW', jest.fn().mockResolvedValue(weatherMock));

    const garden = {
      title: 'Gravity Garden',
      openweather_id: 5378538
    }

    // Must be awaited: otherwise the call reaches the real retrieveLatestOW
    // (and the network) after the stub has been restored.
    const res = await Weather.getGardenWeather(garden);
    expect(res.water).toBe(true);
    expect(res.weather.weather_title).toBe('Mist');
  });
});

