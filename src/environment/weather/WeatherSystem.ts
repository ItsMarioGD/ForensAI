import { WeatherState, Vec3, RoadCondition } from '../../core/types';

export class WeatherSystem {
  private currentWeather: WeatherState;
  private targetWeather: WeatherState;
  private transitionSpeed: number = 0.1;
  private time: number = 0;

  rainParticles: any[] = [];
  private rainAccumulator: number = 0;
  private readonly MAX_RAIN_PARTICLES: number = 10000;

  private onWeatherChangeCallback: ((weather: WeatherState) => void) | null = null;
  private onFrictionChangeCallback: ((friction: number) => void) | null = null;

  constructor() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const dayFraction = (hours * 3600 + minutes * 60) / 86400;

    this.currentWeather = {
      timeOfDay: dayFraction,
      sunIntensity: 1.5,
      sunColor: { x: 1.0, y: 0.95, z: 0.9 },
      moonIntensity: 0.1,
      moonColor: { x: 0.7, y: 0.75, z: 1.0 },
      ambientIntensity: 0.4,
      ambientColor: { x: 0.6, y: 0.65, z: 0.8 },
      fogDensity: 0.002,
      fogColor: { x: 0.8, y: 0.85, z: 0.9 },
      fogNear: 0,
      fogFar: 100,
      precipitationType: 'none',
      precipitationIntensity: 0,
      windDirection: { x: 1, y: 0, z: 0.5 },
      windSpeed: 2,
      cloudCover: 0.2,
      temperature: 25,
      humidity: 0.5,
    };

    this.targetWeather = { ...this.currentWeather, timeOfDay: this.currentWeather.timeOfDay };
  }

  setTimeOfDay(hours: number, minutes: number = 0): void {
    const timeFraction = (hours * 3600 + minutes * 60) / 86400;
    this.targetWeather.timeOfDay = timeFraction;
    this.updateSunPosition(timeFraction);
  }

  private updateSunPosition(timeOfDay: number): void {
    const angle = timeOfDay * Math.PI * 2 - Math.PI / 2;
    const sunHeight = Math.sin(angle);
    const sunAzimuth = Math.cos(angle);

    if (sunHeight > 0) {
      const intensity = Math.max(0.1, sunHeight);
      this.targetWeather.sunIntensity = intensity * 1.5;
      this.targetWeather.sunColor = { x: 1.0, y: 0.85 + sunHeight * 0.15, z: 0.6 + sunHeight * 0.3 };
      this.targetWeather.ambientIntensity = 0.2 + sunHeight * 0.4;
      this.targetWeather.ambientColor = { x: 0.6, y: 0.65, z: 0.8 };
      this.targetWeather.fogDensity = 0.001 + (1 - sunHeight) * 0.005;
      this.targetWeather.moonIntensity = 0;
    } else {
      const nightFactor = Math.min(1, -sunHeight * 2);
      this.targetWeather.sunIntensity = 0.05;
      this.targetWeather.sunColor = { x: 0.3, y: 0.3, z: 0.5 };
      this.targetWeather.ambientIntensity = 0.05 + nightFactor * 0.15;
      this.targetWeather.ambientColor = { x: 0.1, y: 0.1, z: 0.25 };
      this.targetWeather.fogDensity = 0.005 + nightFactor * 0.01;
      this.targetWeather.moonIntensity = nightFactor * 0.3;
    }
  }

  setRain(intensity: number): void {
    this.targetWeather.precipitationType = intensity > 0.01 ? 'rain' : 'none';
    this.targetWeather.precipitationIntensity = intensity;
    this.targetWeather.cloudCover = Math.min(1, 0.2 + intensity * 3);
    this.targetWeather.fogDensity = 0.002 + intensity * 0.01;
    this.targetWeather.humidity = 0.4 + intensity * 0.6;

    if (this.currentWeather.roadCondition && this.onFrictionChangeCallback) {
      const newFriction = intensity > 0.5 ? 0.4 : intensity > 0.1 ? 0.6 : 0.8;
      this.onFrictionChangeCallback(newFriction);
    }
  }

  setSnow(intensity: number): void {
    this.targetWeather.precipitationType = intensity > 0.01 ? 'snow' : 'none';
    this.targetWeather.precipitationIntensity = intensity;
    this.targetWeather.cloudCover = 0.9;
    this.targetWeather.fogDensity = 0.005 + intensity * 0.015;
    this.targetWeather.temperature = Math.max(-10, 5 - intensity * 20);
    this.targetWeather.humidity = 0.8;

    if (this.onFrictionChangeCallback) {
      const newFriction = Math.max(0.1, 0.3 - intensity * 0.2);
      this.onFrictionChangeCallback(newFriction);
    }
  }

  setFog(density: number, color?: Vec3): void {
    this.targetWeather.fogDensity = Math.max(0, Math.min(0.1, density));
    if (color) {
      this.targetWeather.fogColor = { ...color };
    }
  }

  setWind(direction: Vec3, speed: number): void {
    const len = Math.sqrt(direction.x ** 2 + direction.y ** 2 + direction.z ** 2);
    if (len > 0) {
      this.targetWeather.windDirection = { x: direction.x / len, y: direction.y / len, z: direction.z / len };
    }
    this.targetWeather.windSpeed = Math.max(0, speed);
  }

  setTemperature(temp: number): void {
    this.targetWeather.temperature = temp;
  }

  update(dt: number): void {
    this.time += dt;

    const transitionFactor = 1 - Math.exp(-this.transitionSpeed * dt);
    this.lerpWeather(transitionFactor);

    if (this.currentWeather.precipitationIntensity > 0.01) {
      this.updateRainParticles(dt);
    }

    if (this.onWeatherChangeCallback) {
      this.onWeatherChangeCallback(this.currentWeather);
    }
  }

  private lerpWeather(t: number): void {
    const c = this.currentWeather;
    const wt = this.targetWeather;

    c.timeOfDay = wt.timeOfDay;
    c.sunIntensity += (wt.sunIntensity - c.sunIntensity) * t;
    c.moonIntensity += (wt.moonIntensity - c.moonIntensity) * t;
    c.ambientIntensity += (wt.ambientIntensity - c.ambientIntensity) * t;
    c.fogDensity += (wt.fogDensity - c.fogDensity) * t;
    c.precipitationType = wt.precipitationType;
    c.precipitationIntensity += (wt.precipitationIntensity - c.precipitationIntensity) * t;
    c.cloudCover += (wt.cloudCover - c.cloudCover) * t;
    c.temperature += (wt.temperature - c.temperature) * t;
    c.humidity += (wt.humidity - c.humidity) * t;
    c.windSpeed += (wt.windSpeed - c.windSpeed) * t;

    c.sunColor.x += (wt.sunColor.x - c.sunColor.x) * t;
    c.sunColor.y += (wt.sunColor.y - c.sunColor.y) * t;
    c.sunColor.z += (wt.sunColor.z - c.sunColor.z) * t;
    c.fogColor.x += (wt.fogColor.x - c.fogColor.x) * t;
    c.fogColor.y += (wt.fogColor.y - c.fogColor.y) * t;
    c.fogColor.z += (wt.fogColor.z - c.fogColor.z) * t;
  }

  private updateRainParticles(dt: number): void {
    const emissionRate = this.currentWeather.precipitationIntensity * 500;
    this.rainAccumulator += emissionRate * dt;

    while (this.rainAccumulator >= 1 && this.rainParticles.length < this.MAX_RAIN_PARTICLES) {
      const spread = 100;
      const wind = this.currentWeather.windDirection;
      const windStr = this.currentWeather.windSpeed;

      this.rainParticles.push({
        position: {
          x: (Math.random() - 0.5) * spread * 2,
          y: 30 + Math.random() * 20,
          z: (Math.random() - 0.5) * spread * 2,
        },
        velocity: {
          x: wind.x * windStr + (Math.random() - 0.5) * 0.5,
          y: -15 - Math.random() * 10,
          z: wind.z * windStr + (Math.random() - 0.5) * 0.5,
        },
        size: 0.05 + Math.random() * 0.05,
        lifetime: 2 + Math.random() * 1,
      });

      this.rainAccumulator -= 1;
    }

    for (let i = this.rainParticles.length - 1; i >= 0; i--) {
      const p = this.rainParticles[i];
      p.position.x += p.velocity.x * dt;
      p.position.y += p.velocity.y * dt;
      p.position.z += p.velocity.z * dt;
      p.lifetime -= dt;

      if (p.position.y < 0 || p.lifetime <= 0) {
        this.rainParticles.splice(i, 1);
      }
    }
  }

  getCurrentWeather(): WeatherState {
    return { ...this.currentWeather };
  }

  getSunDirection(): Vec3 {
    const angle = this.currentWeather.timeOfDay * Math.PI * 2 - Math.PI / 2;
    return {
      x: Math.cos(angle),
      y: Math.sin(angle),
      z: 0,
    };
  }

  getFrictionModifier(): number {
    switch (this.currentWeather.precipitationType) {
      case 'rain':
        return Math.max(0.3, 1.0 - this.currentWeather.precipitationIntensity * 0.7);
      case 'snow':
        return Math.max(0.1, 1.0 - this.currentWeather.precipitationIntensity * 0.9);
      default:
        return 1.0;
    }
  }

  getFogExp2Density(): number {
    return this.currentWeather.fogDensity;
  }

  setTransitionSpeed(speed: number): void {
    this.transitionSpeed = Math.max(0.01, Math.min(1, speed));
  }

  onWeatherChange(callback: (weather: WeatherState) => void): void {
    this.onWeatherChangeCallback = callback;
  }

  onFrictionChange(callback: (friction: number) => void): void {
    this.onFrictionChangeCallback = callback;
  }

  getRainParticleCount(): number {
    return this.rainParticles.length;
  }
}