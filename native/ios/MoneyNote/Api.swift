import Foundation

enum ApiClient {
    /// CI 用 SIMCTL_CHILD_API_BASE_URL 指向本机后端；
    /// 模拟器本地运行默认 localhost。真机请把下面 example 换成你的
    /// Cloudflare Workers 子域，或启动时设置 API_BASE_URL。地址末尾斜杠自动去掉。
    static var baseURL: String {
        let raw = ProcessInfo.processInfo.environment["API_BASE_URL"] ?? ""
        #if targetEnvironment(simulator)
        let fallback = "http://localhost:3000"
        #else
        let fallback = "https://moneynote-api.cold-manatee.workers.dev"
        #endif
        let value = raw.isEmpty ? fallback : raw
        return value.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    static func records(month: String) async throws -> [MoneyRecord] {
        struct Response: Decodable {
            let items: [MoneyRecord]
        }
        let response: Response = try await request(
            "/api/records?month=\(month)&limit=1000&offset=0"
        )
        return response.items
    }

    static func stats(month: String) async throws -> MonthStats {
        try await request("/api/stats?month=\(month)")
    }

    static func create(_ record: NewRecord) async throws -> MoneyRecord {
        let body = try JSONEncoder().encode(record)
        return try await request("/api/records", method: "POST", body: body)
    }

    private static func request<T: Decodable>(
        _ path: String,
        method: String = "GET",
        body: Data? = nil
    ) async throws -> T {
        guard let url = URL(string: baseURL + path) else {
            throw ApiError.message("后端地址不合法")
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 10
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = body
            request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw ApiError.message("没有拿到服务器响应")
        }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(ApiErrorEnvelope.self, from: data))?
                .error.message ?? "接口返回 \(http.statusCode)"
            throw ApiError.message(message)
        }

        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw ApiError.message("返回数据解析失败")
        }
    }
}
