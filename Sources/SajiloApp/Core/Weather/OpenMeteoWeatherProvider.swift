import Foundation

protocol WeatherProviding: Sendable {
    func currentWeather(at location: WeatherLocation) async throws -> WeatherSnapshot
}

struct OpenMeteoWeatherProvider: WeatherProviding {
    private let session: URLSession

    init(session: URLSession? = nil) {
        self.session = session ?? .sajilo()
    }


    func currentWeather(at location: WeatherLocation) async throws -> WeatherSnapshot {
        var components = URLComponents(string: "https://api.open-meteo.com/v1/forecast")!
        components.queryItems = [
            URLQueryItem(name: "latitude", value: String(location.latitude)),
            URLQueryItem(name: "longitude", value: String(location.longitude)),
            URLQueryItem(
                name: "current",
                value: "temperature_2m,apparent_temperature,precipitation_probability,weather_code"
            ),
            URLQueryItem(
                name: "daily",
                value: "temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,sunrise,sunset"
            ),
            URLQueryItem(name: "forecast_days", value: "5"),
            URLQueryItem(name: "timezone", value: "Asia/Kathmandu")
        ]

        let (data, response) = try await session.data(from: components.url!)
        guard let response = response as? HTTPURLResponse, 200..<300 ~= response.statusCode else {
            throw WeatherProviderError.invalidResponse
        }
        return try Self.decode(data, location: location, fetchedAt: .now)
    }

    static func decode(_ data: Data, location: WeatherLocation, fetchedAt: Date) throws -> WeatherSnapshot {
        let response = try JSONDecoder().decode(Response.self, from: data)
        let daily = response.daily

        guard let high = daily.maximums.first, let low = daily.minimums.first else {
            throw WeatherProviderError.invalidResponse
        }

        // The arrays are parallel; a short one means a malformed payload, so
        // the forecast is built only across indices every array actually has.
        let dayCount = min(
            daily.days.count,
            daily.maximums.count,
            daily.minimums.count,
            daily.weatherCodes.count,
            daily.precipitationChances.count
        )
        let forecast: [DailyForecast] = (0..<dayCount).compactMap { index in
            guard let date = dayFormatter.date(from: daily.days[index]) else { return nil }
            return DailyForecast(
                date: date,
                highCelsius: daily.maximums[index],
                lowCelsius: daily.minimums[index],
                condition: WeatherCondition(code: daily.weatherCodes[index]),
                precipitationChance: daily.precipitationChances[index] ?? 0
            )
        }

        return WeatherSnapshot(
            location: location,
            temperatureCelsius: response.current.temperature,
            apparentTemperatureCelsius: response.current.apparentTemperature ?? response.current.temperature,
            precipitationChance: response.current.precipitationChance ?? 0,
            highCelsius: high,
            lowCelsius: low,
            condition: WeatherCondition(code: response.current.weatherCode),
            sunrise: daily.sunrises?.first.flatMap(timeFormatter.date(from:)),
            sunset: daily.sunsets?.first.flatMap(timeFormatter.date(from:)),
            daily: forecast,
            // The reading itself can be up to `interval` seconds older than the
            // request, so "updated N ago" has to count from the source's own
            // timestamp, not from when the response happened to arrive.
            observedAt: timeFormatter.date(from: response.current.time) ?? fetchedAt,
            fetchedAt: fetchedAt
        )
    }

    /// Open-Meteo returns local time without an offset, and the request pins
    /// `timezone=Asia/Kathmandu`, so it is parsed in that zone.
    private static let timeFormatter = NepalTime.formatter("yyyy-MM-dd'T'HH:mm")
    private static let dayFormatter = NepalTime.formatter("yyyy-MM-dd")

    private struct Response: Decodable {
        let current: Current
        let daily: Daily
    }

    private struct Current: Decodable {
        let time: String
        let temperature: Double
        let apparentTemperature: Double?
        let precipitationChance: Int?
        let weatherCode: Int

        enum CodingKeys: String, CodingKey {
            case time
            case temperature = "temperature_2m"
            case apparentTemperature = "apparent_temperature"
            case precipitationChance = "precipitation_probability"
            case weatherCode = "weather_code"
        }
    }

    private struct Daily: Decodable {
        let days: [String]
        let maximums: [Double]
        let minimums: [Double]
        let weatherCodes: [Int]
        let precipitationChances: [Int?]
        let sunrises: [String]?
        let sunsets: [String]?

        enum CodingKeys: String, CodingKey {
            case days = "time"
            case maximums = "temperature_2m_max"
            case minimums = "temperature_2m_min"
            case weatherCodes = "weather_code"
            case precipitationChances = "precipitation_probability_max"
            case sunrises = "sunrise"
            case sunsets = "sunset"
        }

        init(from decoder: any Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            days = try container.decodeIfPresent([String].self, forKey: .days) ?? []
            maximums = try container.decode([Double].self, forKey: .maximums)
            minimums = try container.decode([Double].self, forKey: .minimums)
            weatherCodes = try container.decodeIfPresent([Int].self, forKey: .weatherCodes) ?? []
            precipitationChances = try container.decodeIfPresent([Int?].self, forKey: .precipitationChances) ?? []
            sunrises = try container.decodeIfPresent([String].self, forKey: .sunrises)
            sunsets = try container.decodeIfPresent([String].self, forKey: .sunsets)
        }
    }
}

enum WeatherProviderError: Error {
    case invalidResponse
}

extension WeatherCondition {
    /// WMO weather interpretation codes, as published by Open-Meteo.
    init(code: Int) {
        switch code {
        case 0: self = .clear
        case 1, 2: self = .partlyCloudy
        case 3: self = .overcast
        case 45, 48: self = .fog
        case 51, 53, 55, 56, 57: self = .drizzle
        case 61, 63, 65, 66, 67: self = .rain
        case 71, 73, 75, 77: self = .snow
        case 80, 81, 82, 85, 86: self = .showers
        case 95, 96, 99: self = .thunderstorm
        default: self = .unknown
        }
    }
}
