const { EventEmitter } = require('events');

const CODES = {
  0: ['Céu limpo', 'clear'],
  1: ['Quase limpo', 'partly'],
  2: ['Parcialmente nublado', 'partly'],
  3: ['Nublado', 'cloud'],
  45: ['Neblina', 'fog'],
  48: ['Neblina', 'fog'],
  51: ['Garoa fraca', 'drizzle'],
  53: ['Garoa', 'drizzle'],
  55: ['Garoa forte', 'drizzle'],
  56: ['Garoa congelante', 'drizzle'],
  57: ['Garoa congelante', 'drizzle'],
  61: ['Chuva fraca', 'rain'],
  63: ['Chuva', 'rain'],
  65: ['Chuva forte', 'rain'],
  66: ['Chuva congelante', 'rain'],
  67: ['Chuva congelante', 'rain'],
  71: ['Neve fraca', 'snow'],
  73: ['Neve', 'snow'],
  75: ['Neve forte', 'snow'],
  77: ['Neve', 'snow'],
  80: ['Pancadas de chuva', 'rain'],
  81: ['Pancadas de chuva', 'rain'],
  82: ['Temporal', 'storm'],
  85: ['Neve', 'snow'],
  86: ['Neve forte', 'snow'],
  95: ['Trovoada', 'storm'],
  96: ['Trovoada com granizo', 'storm'],
  99: ['Trovoada com granizo', 'storm'],
};

const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function searchCity(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const data = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=pt&format=json`);
  return (data.results || []).map((r) => ({
    name: r.name,
    admin1: r.admin1 || '',
    country: r.country || '',
    latitude: r.latitude,
    longitude: r.longitude,
  }));
}

async function forecast(city) {
  const params = new URLSearchParams({
    latitude: city.latitude,
    longitude: city.longitude,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,precipitation',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '1',
  });
  const data = await getJson(`https://api.open-meteo.com/v1/forecast?${params}`);
  const c = data.current;
  const [label, icon] = CODES[c.weather_code] || ['—', 'cloud'];
  return {
    city: city.name,
    temp: c.temperature_2m,
    feels: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    wind: c.wind_speed_10m,
    isDay: c.is_day === 1,
    raining: (c.precipitation || 0) > 0 || RAIN_CODES.has(c.weather_code),
    label,
    icon,
    max: data.daily?.temperature_2m_max?.[0] ?? null,
    min: data.daily?.temperature_2m_min?.[0] ?? null,
    rain: data.daily?.precipitation_probability_max?.[0] ?? null,
    updatedAt: Date.now(),
  };
}

class Weather extends EventEmitter {
  constructor(getCity) {
    super();
    this.getCity = getCity;
    this.timer = null;
    this.last = null;
  }

  start() {
    this.refresh();
    this.timer = setInterval(() => this.refresh(), 15 * 60 * 1000);
  }

  async refresh() {
    const city = this.getCity();
    if (!city) {
      this.last = null;
      this.emit('update', null);
      return;
    }
    try {
      this.last = await forecast(city);
      this.emit('update', this.last);
    } catch (err) {
      setTimeout(() => this.refresh(), 60 * 1000);
    }
  }

  stop() {
    clearInterval(this.timer);
  }
}

module.exports = { Weather, searchCity };
