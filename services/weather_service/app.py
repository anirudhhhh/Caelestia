"""
ControlPlane.ai — Weather Service Component (§6 PRD)

Handles weather-related natural language queries.
Extracts location and metrics using LLM, performs geocoding via Open-Meteo Geocoding API,
and fetches real-time meteorological conditions from Open-Meteo API.
Exposes POST /weather, POST /query, and POST /complete.
"""

import sys
import time
import re
import json
from pathlib import Path
from typing import Dict, Any, List, Optional
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from shared.config import setup_logging, GEMINI_API_KEY, DEFAULT_MODEL

logger = setup_logging("weather_service")
app = FastAPI(title="Weather Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WMO_WEATHER_CODES = {
    0: "Clear Sky",
    1: "Mainly Clear",
    2: "Partly Cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Depositing Rime Fog",
    51: "Light Drizzle",
    53: "Moderate Drizzle",
    55: "Dense Drizzle",
    61: "Slight Rain",
    63: "Moderate Rain",
    65: "Heavy Rain",
    71: "Slight Snow Fall",
    73: "Moderate Snow Fall",
    75: "Heavy Snow Fall",
    77: "Snow Grains",
    80: "Slight Rain Showers",
    81: "Moderate Rain Showers",
    82: "Violent Rain Showers",
    85: "Slight Snow Showers",
    86: "Heavy Snow Showers",
    95: "Thunderstorm",
    96: "Thunderstorm with Slight Hail",
    99: "Thunderstorm with Heavy Hail",
}


class WeatherRequest(BaseModel):
    query: Optional[str] = None
    messages: Optional[List[Dict[str, Any]]] = None
    location: Optional[str] = None


class WeatherData(BaseModel):
    location: str
    temperature: float
    condition: str
    humidity: Optional[float] = None
    wind_speed: Optional[float] = None
    apparent_temperature: Optional[float] = None
    coordinates: Optional[Dict[str, float]] = None


class WeatherResponse(BaseModel):
    status: str
    service: str = "weather"
    data: Optional[WeatherData] = None
    content: Optional[str] = None
    error: Optional[str] = None


async def extract_weather_params_llm(text: str) -> Dict[str, Any]:
    """Uses LLM to extract target location and time parameters from natural language text."""
    if not GEMINI_API_KEY:
        return {}

    prompt = f"""
Extract the geographical location/city from this weather inquiry.
Output ONLY a JSON object with this EXACT structure:
{{"location": "<city_or_place_name>"}}

Query: "{text}"

JSON:
"""
    candidate_models = [
        DEFAULT_MODEL,
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.5-pro"
    ]
    candidate_models = list(dict.fromkeys(candidate_models))

    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "maxOutputTokens": 100,
            "temperature": 0.0
        }
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        for model_name in candidate_models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"
            try:
                resp = await client.post(url, json=body)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        raw_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        clean_json = raw_text.replace("```json", "").replace("```", "").strip()
                        return json.loads(clean_json)
            except Exception as e:
                logger.warning(f"Gemini weather extraction failed on {model_name}: {e}")
                continue

    return {}


def fallback_extract_location(text: str) -> Optional[str]:
    """Deterministic fallback regex extraction for city / place names."""
    patterns = [
        r'\b(?:in|for|at|around|near)\b\s+([A-Za-z\s]+?)(?:\s+right\s+now|\s+today|\s+tomorrow|\?|\.|$)',
        r'\b(?:weather|temperature|forecast)\b\s+(?:in|of|for)\s+([A-Za-z\s]+?)(?:\?|\.|$)',
        r'\bhow\s+(?:hot|cold|warm)\s+is\s+it\s+in\b\s+([A-Za-z\s]+?)(?:\?|\.|$)'
    ]
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            clean = m.group(1).strip()
            if clean and clean.lower() not in ("the", "it", "now", "today", "tomorrow"):
                return clean
    return None


async def geocode_location(location: str) -> Optional[Dict[str, Any]]:
    """Resolves city/place name to latitude and longitude using Open-Meteo Geocoding API."""
    url = f"https://geocoding-api.open-meteo.com/v1/search?name={location}&count=1&language=en&format=json"
    async with httpx.AsyncClient(timeout=6.0) as client:
        try:
            resp = await client.get(url)
            if resp.status_code == 200:
                results = resp.json().get("results", [])
                if results:
                    best = results[0]
                    return {
                        "name": best.get("name", location),
                        "country": best.get("country", ""),
                        "admin1": best.get("admin1", ""),
                        "latitude": float(best.get("latitude")),
                        "longitude": float(best.get("longitude"))
                    }
        except Exception as e:
            logger.error(f"Geocoding API failed for '{location}': {e}")
    return None


async def fetch_open_meteo_weather(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    """Fetches real-time weather metrics from Open-Meteo Forecast API."""
    url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m"
    )
    async with httpx.AsyncClient(timeout=6.0) as client:
        try:
            resp = await client.get(url)
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            logger.error(f"Open-Meteo weather API call failed ({lat}, {lon}): {e}")
    return None


@app.get("/")
@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "weather", "provider": "Open-Meteo"}


@app.post("/weather", response_model=WeatherResponse)
@app.post("/query", response_model=WeatherResponse)
@app.post("/complete", response_model=WeatherResponse)
async def handle_weather_query(req: WeatherRequest):
    # Extract query text from either 'query' field or 'messages' array
    prompt = req.query
    if not prompt and req.messages:
        for m in reversed(req.messages):
            if m.get("role") in ("user", "human"):
                prompt = m.get("content", "")
                break
        if not prompt and req.messages:
            prompt = req.messages[-1].get("content", "")

    location = req.location

    # 1. Parameter Extraction via LLM / Regex
    if not location:
        if prompt:
            extracted = await extract_weather_params_llm(prompt)
            location = extracted.get("location")
            if not location:
                location = fallback_extract_location(prompt)

    if not location or not location.strip():
        logger.warning(f"Weather location extraction failed for prompt: '{prompt}'")
        return WeatherResponse(
            status="error",
            service="weather",
            error="Could not find the specified location"
        )

    # 2. Location Resolution (Geocoding)
    geo = await geocode_location(location.strip())
    if not geo:
        logger.warning(f"Geocoding lookup returned no results for location: '{location}'")
        return WeatherResponse(
            status="error",
            service="weather",
            error="Could not find the specified location"
        )

    # 3. Weather API Call
    weather_raw = await fetch_open_meteo_weather(geo["latitude"], geo["longitude"])
    if not weather_raw or "current" not in weather_raw:
        logger.error(f"Weather API retrieval failed for {geo['name']}")
        return WeatherResponse(
            status="error",
            service="weather",
            error="Failed to retrieve weather information"
        )

    current = weather_raw["current"]
    temp_c = float(current.get("temperature_2m", 0.0))
    temp_f = round((temp_c * 9.0 / 5.0) + 32.0, 1)
    humidity = float(current.get("relative_humidity_2m", 0.0))
    wind_speed = float(current.get("wind_speed_10m", 0.0))
    apparent_temp = float(current.get("apparent_temperature", temp_c))
    wmo_code = int(current.get("weather_code", 0))
    condition = WMO_WEATHER_CODES.get(wmo_code, "Partly Cloudy")

    display_name = f"{geo['name']}, {geo['country']}" if geo.get("country") else geo["name"]

    content_summary = (
        f"[Weather Service: Live Report]\n"
        f"Location: {display_name} ({geo['latitude']:.2f}°N, {geo['longitude']:.2f}°E)\n"
        f"Temperature: {temp_c}°C ({temp_f}°F)\n"
        f"Condition: {condition}\n"
        f"Humidity: {humidity}%\n"
        f"Wind Speed: {wind_speed} km/h\n"
        f"Feels Like: {apparent_temp}°C"
    )

    return WeatherResponse(
        status="success",
        service="weather",
        data=WeatherData(
            location=geo["name"],
            temperature=temp_c,
            condition=condition,
            humidity=humidity,
            wind_speed=wind_speed,
            apparent_temperature=apparent_temp,
            coordinates={"latitude": geo["latitude"], "longitude": geo["longitude"]}
        ),
        content=content_summary
    )
