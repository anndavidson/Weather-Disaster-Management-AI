const weatherCodes = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail"
};

const REFRESH_MINUTES = 10;

/*
   OPTIONAL: paste a free WeatherAPI.com key here
   (https://www.weatherapi.com) to use observed
   current conditions (temperature, wind, humidity,
   pressure, rain) instead of Open-Meteo's model
   values. Forecast data still comes from Open-Meteo.
*/
const WEATHERAPI_KEY = "";


async function applyLiveObservation(data, latitude, longitude) {

    if (!WEATHERAPI_KEY) {
        return;
    }

    try {

        const response = await fetch(
            `https://api.weatherapi.com/v1/current.json?key=${WEATHERAPI_KEY}&q=${latitude},${longitude}&aqi=no`,
            { cache: "no-store" }
        );

        if (!response.ok) {
            return;
        }

        const c = (await response.json()).current;

        Object.assign(data.current, {
            temperature_2m: c.temp_c,
            apparent_temperature: c.feelslike_c,
            relative_humidity_2m: c.humidity,
            wind_speed_10m: c.wind_kph,
            wind_gusts_10m: c.gust_kph,
            pressure_msl: c.pressure_mb,
            precipitation: c.precip_mm
        });

        data.liveText = c.condition.text;

        if (/thunder/i.test(c.condition.text)) {
            data.current.weather_code = 95;
        }

    } catch (error) {

        console.log("Live observation unavailable, using Open-Meteo.");
    }
}


/* ================================
   GET CITY COORDINATES
   (accepts "City" or "City, State/Country")
================================ */

async function getCoordinates(city) {

    const parts = city.split(",").map(p => p.trim()).filter(Boolean);

    const cityName = parts[0];

    const hint = parts.slice(1).join(" ").toLowerCase();

    const url =
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=10&language=en&format=json`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error("Unable to find location.");
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
        throw new Error("City not found.");
    }

    let match = data.results[0];

    if (hint) {

        const found = data.results.find(r =>
            [r.country, r.country_code, r.admin1, r.admin2]
                .filter(Boolean)
                .some(v => {
                    const value = v.toLowerCase();
                    return value === hint ||
                        hint.includes(value) ||
                        value.includes(hint);
                })
        );

        if (found) {
            match = found;
        }
    }

    return {
        latitude: match.latitude,
        longitude: match.longitude,
        name: match.name,
        admin: match.admin1,
        country: match.country
    };
}


function buildPlaceName(location) {

    const parts = [location.name];

    if (location.admin && location.admin !== location.name) {
        parts.push(location.admin);
    }

    if (location.country) {
        parts.push(location.country);
    }

    return parts.join(", ");
}


/* ================================
   GET LIVE WEATHER DATASET
================================ */

function buildWeatherUrl(latitude, longitude, extended) {

    const hourly = [
        "temperature_2m",
        "apparent_temperature",
        "relative_humidity_2m",
        "precipitation",
        "precipitation_probability",
        "weather_code",
        "wind_speed_10m",
        "wind_gusts_10m",
        "pressure_msl",
        "cape"
    ];

    if (extended) {
        hourly.push("soil_moisture_0_to_1cm", "runoff");
    }

    return `https://api.open-meteo.com/v1/forecast?` +
        `latitude=${latitude}` +
        `&longitude=${longitude}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,weather_code,wind_speed_10m,wind_gusts_10m,pressure_msl,cape` +
        `&hourly=${hourly.join(",")}` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,showers_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max` +
        `&past_hours=24` +
        `&forecast_days=7` +
        `&timezone=auto`;
}


async function getWeatherByCoordinates(
    latitude,
    longitude,
    placeName
) {

    /*
       Always request fresh data from the API.
       If the optional soil / runoff variables
       are rejected, retry without them.
    */

    let response = await fetch(
        buildWeatherUrl(latitude, longitude, true),
        { cache: "no-store" }
    );

    if (!response.ok) {

        response = await fetch(
            buildWeatherUrl(latitude, longitude, false),
            { cache: "no-store" }
        );
    }

    if (!response.ok) {
        throw new Error("Weather data could not be loaded.");
    }

    const data = await response.json();

    await applyLiveObservation(data, latitude, longitude);

    localStorage.setItem("weatherData", JSON.stringify(data));
    localStorage.setItem("placeName", placeName);
    localStorage.setItem("placeLat", String(latitude));
    localStorage.setItem("placeLon", String(longitude));
    localStorage.setItem("weatherDatasetTime", new Date().toISOString());

    return data;
}


/* ================================
   USE CURRENT LOCATION
================================ */

function useMyLocation() {

    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser.");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async function (position) {

            try {

                const latitude = position.coords.latitude;
                const longitude = position.coords.longitude;

                await getWeatherByCoordinates(
                    latitude,
                    longitude,
                    "Current Location"
                );

                window.location.href = "weather.html";

            } catch (error) {

                alert(error.message);

            }

        },
        function () {

            alert("Location permission was not granted.");

        }
    );
}


/* ================================
   FORMAT NUMBER
================================ */

function number(value, digits = 1) {

    if (
        value === undefined ||
        value === null ||
        isNaN(value)
    ) {
        return "N/A";
    }

    return Number(value).toFixed(digits);
}


/* ================================
   WEATHER DESCRIPTION
================================ */

function getWeatherDescription(code) {

    return weatherCodes[code] ||
        "Weather information unavailable";
}


/* ================================
   DISPLAY WEATHER
================================ */

function displayWeather(data, placeName) {

    if (!data || !data.current) {
        return;
    }

    const current = data.current;

    setText("locationName", placeName);

    setText("temperature", `${number(current.temperature_2m)} °C`);

    setText("feelsLike", `${number(current.apparent_temperature)} °C`);

    setText("humidity", `${number(current.relative_humidity_2m, 0)} %`);

    setText("wind", `${number(current.wind_speed_10m)} km/h`);

    setText("rain", `${number(current.precipitation)} mm`);

    setText(
        "weatherDescription",
        data.liveText || getWeatherDescription(current.weather_code)
    );

    calculateDisasterRisks(data);

    displayWeatherDataset(data);

    displayForecast(data);
}


/* ================================
   DISPLAY DATASET
================================ */

function displayWeatherDataset(data) {

    if (!data || !data.current) {
        return;
    }

    const current = data.current;

    setText("datasetTemperature", `${number(current.temperature_2m)} °C`);

    setText("datasetHumidity", `${number(current.relative_humidity_2m, 0)} %`);

    setText("datasetRainfall", `${number(current.precipitation)} mm`);

    setText("datasetWind", `${number(current.wind_speed_10m)} km/h`);

    setText("datasetWindGust", `${number(current.wind_gusts_10m)} km/h`);

    setText("datasetPressure", `${number(current.pressure_msl)} hPa`);

    setText("datasetCape", `${number(current.cape)} J/kg`);

    setText(
        "datasetWeather",
        data.liveText || getWeatherDescription(current.weather_code)
    );
}


/* ================================
   RISK ENGINE (LIVE, FROM "NOW")
================================ */

/*
   Find the hourly index that matches the
   current hour, so every window starts at
   the present moment (not midnight).
*/

function getNowIndex(data) {

    const times = data.hourly.time || [];

    const currentTime =
        (data.current && data.current.time) || "";

    const hourKey = currentTime.slice(0, 13);

    let index = times.findIndex(t => t.slice(0, 13) === hourKey);

    if (index < 0) {

        index = 0;

        for (let i = 0; i < times.length; i++) {
            if (times[i] <= currentTime) {
                index = i;
            }
        }
    }

    return index;
}


function windowValues(values, start, count) {

    if (!Array.isArray(values)) {
        return [];
    }

    return values
        .slice(start, start + count)
        .filter(v => v !== null && v !== undefined && !isNaN(v))
        .map(Number);
}


function sumOf(list) {
    return list.reduce((a, b) => a + b, 0);
}


function maxOf(list, fallback = 0) {
    return list.length ? Math.max(...list) : fallback;
}


function part(value, full, weight) {
    return Math.min(Math.max(value / full, 0), 1) * weight;
}


/*
   Combine weighted components. Components whose
   data is unavailable are left out and the rest
   are rescaled to 0-100.
*/

function combine(components) {

    const available =
        components.filter(c => c.value !== null);

    const totalWeight =
        sumOf(available.map(c => c.weight));

    if (!totalWeight) {
        return 0;
    }

    const earned =
        sumOf(available.map(c => part(c.value, c.full, c.weight)));

    return (earned / totalWeight) * 100;
}


function calculateDisasterRisks(data) {

    if (!data || !data.hourly || !data.daily || !data.current) {
        console.log(
            "Weather dataset unavailable. Risk calculation stopped."
        );
        return;
    }

    const hourly = data.hourly;
    const current = data.current;

    const now = getNowIndex(data);

    const past24Start = Math.max(0, now - 24);


    /* ----------------------------
       RAINFALL (next 24 h)
    ---------------------------- */

    const nextRain24 = windowValues(hourly.precipitation, now, 24);

    const rain24 = sumOf(nextRain24);

    const maxHourlyRain = maxOf(nextRain24);

    const maxRainProbability =
        maxOf(windowValues(hourly.precipitation_probability, now, 24));

    const currentRainRate = Number(current.precipitation) || 0;


    /* ----------------------------
       FLOOD (past 24 h + next 72 h)
    ---------------------------- */

    const pastRain24 =
        sumOf(windowValues(hourly.precipitation, past24Start, now - past24Start));

    const rain72 =
        sumOf(windowValues(hourly.precipitation, now, 72));

    const maxDailyRain =
        maxOf(
            (data.daily.precipitation_sum || [])
                .slice(0, 3)
                .filter(v => v !== null)
        );

    const runoffList = windowValues(hourly.runoff, now, 72);

    const runoff72 = sumOf(runoffList);

    const soilList = windowValues(hourly.soil_moisture_0_to_1cm, now, 24);

    const averageSoilMoisture =
        soilList.length ? sumOf(soilList) / soilList.length : 0;


    /* ----------------------------
       WIND / PRESSURE (next 24 h)
    ---------------------------- */

    const windList = windowValues(hourly.wind_speed_10m, now, 24);

    const gustList = windowValues(hourly.wind_gusts_10m, now, 24);

    const maxWind =
        Math.max(maxOf(windList), Number(current.wind_speed_10m) || 0);

    const maxGust =
        Math.max(maxOf(gustList), Number(current.wind_gusts_10m) || 0);

    const pressureList = windowValues(hourly.pressure_msl, now, 24);

    const startingPressure =
        Number(current.pressure_msl) ||
        (pressureList.length ? pressureList[0] : 0);

    const pressureDrop =
        pressureList.length
            ? Math.max(0, startingPressure - Math.min(...pressureList))
            : 0;


    /* ----------------------------
       THUNDERSTORM (next 24 h)
    ---------------------------- */

    const maxCAPE =
        Math.max(
            maxOf(windowValues(hourly.cape, now, 24)),
            Number(current.cape) || 0
        );

    const codeList = windowValues(hourly.weather_code, now, 24);

    const stormNow = Number(current.weather_code) >= 95;

    const stormSoon = codeList.some(code => code >= 95);


    /* ----------------------------
       HEAT (feels-like temperature)
    ---------------------------- */

    const apparentList =
        windowValues(hourly.apparent_temperature, now, 24);

    const maxApparent =
        Math.max(
            maxOf(apparentList, -100),
            Number(current.apparent_temperature) || -100
        );

    const maxTemperature =
        maxOf(
            windowValues(hourly.temperature_2m, now, 24),
            Number(current.temperature_2m) || 0
        );


    /* ============================
       RISK SCORES (0 - 100)
       Project-defined indicators,
       NOT official warning levels.
    ============================ */

    const rainScore = combine([
        { value: rain24, full: 100, weight: 45 },
        { value: maxHourlyRain, full: 20, weight: 25 },
        { value: maxRainProbability, full: 100, weight: 15 },
        { value: currentRainRate, full: 10, weight: 15 }
    ]);

    const floodScore = combine([
        { value: rain72, full: 150, weight: 30 },
        { value: pastRain24, full: 80, weight: 20 },
        { value: maxDailyRain, full: 100, weight: 15 },
        {
            value: runoffList.length ? runoff72 : null,
            full: 50,
            weight: 20
        },
        {
            value: soilList.length ? averageSoilMoisture : null,
            full: 0.45,
            weight: 15
        }
    ]);

    const windScore = combine([
        { value: maxWind, full: 80, weight: 40 },
        { value: maxGust, full: 120, weight: 40 },
        { value: pressureDrop, full: 12, weight: 20 }
    ]);

    let stormEvent = 0;

    if (stormNow) {
        stormEvent = 50;
    } else if (stormSoon) {
        stormEvent = 35;
    }

    const thunderstormScore =
        part(maxCAPE, 2500, 50) + stormEvent;

    const heatScore =
        part(maxApparent - 32, 14, 100);


    const risks = {

        rain: createRisk(rainScore),

        flood: createRisk(floodScore),

        wind: createRisk(windScore),

        thunderstorm: createRisk(thunderstormScore),

        heat: createRisk(heatScore),

        dataset: {
            rain24,
            rain72,
            pastRain24,
            maxHourlyRain,
            maxRainProbability,
            maxDailyRain,
            runoff72,
            averageSoilMoisture,
            hasRunoff: runoffList.length > 0,
            hasSoil: soilList.length > 0,
            maxWind,
            maxGust,
            pressureDrop,
            maxCAPE,
            maxTemperature,
            maxApparent
        }
    };

    localStorage.setItem("riskResults", JSON.stringify(risks));

    displayRisks(risks);
}


/* ================================
   CREATE RISK LEVEL
================================ */

function createRisk(score) {

    score = Math.max(0, Math.min(100, score));

    let level;

    if (score >= 75) {
        level = "SEVERE";
    } else if (score >= 50) {
        level = "HIGH";
    } else if (score >= 25) {
        level = "MODERATE";
    } else {
        level = "LOW";
    }

    return {
        score: Number(score.toFixed(1)),
        level: level
    };
}


/* ================================
   DISPLAY RISKS
================================ */

function displayRisks(risks) {

    if (!risks) {
        return;
    }

    setRisk("rainRisk", risks.rain);
    setRisk("floodRisk", risks.flood);
    setRisk("windRisk", risks.wind);
    setRisk("stormRisk", risks.thunderstorm);
    setRisk("heatRisk", risks.heat);

    const overall =
        Math.max(
            risks.rain.score,
            risks.flood.score,
            risks.wind.score,
            risks.thunderstorm.score,
            risks.heat.score
        );

    setRisk("overallStatus", createRisk(overall));

    const d = risks.dataset;

    setText(
        "rainCalculation",
        `Next 24h rainfall: ${number(d.rain24)} mm | Peak hourly: ${number(d.maxHourlyRain)} mm/h | Rain probability: ${number(d.maxRainProbability, 0)}%`
    );

    const soilText =
        d.hasSoil ? number(d.averageSoilMoisture, 2) : "N/A";

    const runoffText =
        d.hasRunoff ? `${number(d.runoff72)} mm` : "N/A";

    setText(
        "floodCalculation",
        `Past 24h rain: ${number(d.pastRain24)} mm | Next 72h rain: ${number(d.rain72)} mm | Runoff: ${runoffText} | Soil moisture: ${soilText}`
    );

    setText(
        "windCalculation",
        `Max wind (24h): ${number(d.maxWind)} km/h | Max gust: ${number(d.maxGust)} km/h | Pressure drop: ${number(d.pressureDrop)} hPa`
    );

    setText(
        "stormCalculation",
        `Maximum CAPE (24h): ${number(d.maxCAPE)} J/kg`
    );

    setText(
        "heatCalculation",
        `Max feels-like (24h): ${number(d.maxApparent)} °C | Max temperature: ${number(d.maxTemperature)} °C`
    );
}


/* ================================
   RISK CARD
================================ */

function setRisk(elementId, risk) {

    const element = document.getElementById(elementId);

    if (!element || !risk) {
        return;
    }

    element.textContent = `${risk.level} (${risk.score}/100)`;

    element.className = `risk-value ${risk.level.toLowerCase()}`;
}


/* ================================
   FORECAST (with daily risk)
================================ */

function dailyRisk(daily, i) {

    const precip = Number(daily.precipitation_sum[i]) || 0;

    const prob = Number(daily.precipitation_probability_max[i]) || 0;

    const wind = Number(daily.wind_speed_10m_max[i]) || 0;

    const gust = Number(daily.wind_gusts_10m_max[i]) || 0;

    const tmax = Number(daily.temperature_2m_max[i]) || 0;

    const code = Number(daily.weather_code[i]) || 0;

    const rain =
        part(precip, 100, 70) + part(prob, 100, 30);

    const windRisk =
        part(wind, 80, 50) + part(gust, 120, 50);

    const heat = part(tmax - 33, 12, 100);

    const storm = code >= 95 ? 60 : 0;

    return createRisk(Math.max(rain, windRisk, heat, storm));
}


function displayForecast(data) {

    const table = document.getElementById("forecastTable");

    if (!table || !data.daily) {
        return;
    }

    const daily = data.daily;

    const colors = {
        LOW: "var(--green)",
        MODERATE: "var(--yellow)",
        HIGH: "var(--orange)",
        SEVERE: "var(--red)"
    };

    let html = "";

    for (let i = 0; i < daily.time.length; i++) {

        const risk = dailyRisk(daily, i);

        html += `
            <tr>

                <td>${daily.time[i]}</td>

                <td>${getWeatherDescription(daily.weather_code[i])}</td>

                <td>${number(daily.temperature_2m_max[i])} °C</td>

                <td>
                    ${number(daily.precipitation_sum[i])} mm
                    (${number(daily.precipitation_probability_max[i], 0)}%)
                </td>

                <td>${number(daily.wind_speed_10m_max[i])} km/h</td>

                <td style="color:${colors[risk.level]};font-weight:600;">
                    ${risk.level} (${risk.score})
                </td>

            </tr>
        `;
    }

    table.innerHTML = html;
}


/* ================================
   HELPER FUNCTIONS
================================ */

function setText(id, value) {

    const element = document.getElementById(id);

    if (element) {
        element.textContent = value;
    }
}


/* ================================
   LOAD SAVED + REFRESH LIVE DATA
================================ */

function pageShowsWeather() {

    return Boolean(
        document.getElementById("locationName") ||
        document.getElementById("forecastTable")
    );
}


function loadSavedWeather() {

    const saved = localStorage.getItem("weatherData");

    const place = localStorage.getItem("placeName");

    if (!saved) {
        return;
    }

    try {

        displayWeather(
            JSON.parse(saved),
            place || "Selected Location"
        );

    } catch (error) {

        console.log("Saved weather data could not be loaded.");

    }
}


async function refreshLiveWeather() {

    const lat = localStorage.getItem("placeLat");

    const lon = localStorage.getItem("placeLon");

    const place = localStorage.getItem("placeName");

    if (!lat || !lon) {
        return;
    }

    try {

        const data =
            await getWeatherByCoordinates(
                lat,
                lon,
                place || "Selected Location"
            );

        displayWeather(data, place || "Selected Location");

    } catch (error) {

        console.log("Live refresh failed:", error.message);

    }
}


/* ================================
   PAGE LOAD
================================ */

document.addEventListener("DOMContentLoaded", function () {

    const searchButton = document.getElementById("checkWeather");

    const locationButton = document.getElementById("useLocation");

    const cityInput = document.getElementById("cityInput");


    /* ANALYSE WEATHER BUTTON */

    if (searchButton) {

        const runSearch = async function () {

            const city = cityInput.value.trim();

            if (!city) {
                alert("Please enter a city name.");
                return;
            }

            searchButton.disabled = true;

            searchButton.textContent = "Analysing Weather...";

            try {

                const location = await getCoordinates(city);

                await getWeatherByCoordinates(
                    location.latitude,
                    location.longitude,
                    buildPlaceName(location)
                );

                window.location.href = "weather.html";

            } catch (error) {

                console.error("Weather analysis error:", error);

                alert(
                    error.message === "City not found."
                        ? "City not found. Please check the city name."
                        : "Unable to analyse the weather. " +
                          "Please check your internet connection " +
                          "and city name."
                );

                searchButton.disabled = false;

                searchButton.textContent = "Analyse Weather →";
            }
        };

        searchButton.addEventListener("click", runSearch);

        cityInput.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                runSearch();
            }
        });
    }


    /* MY LOCATION BUTTON */

    if (locationButton) {

        locationButton.addEventListener("click", useMyLocation);
    }


    /*
       Show the last result instantly, then
       fetch fresh live data right away and
       again every few minutes.
    */

    if (pageShowsWeather()) {

        loadSavedWeather();

        refreshLiveWeather();

        setInterval(refreshLiveWeather, REFRESH_MINUTES * 60 * 1000);
    }

});
