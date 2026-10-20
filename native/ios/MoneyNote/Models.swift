import Foundation

struct MoneyRecord: Identifiable, Decodable {
    let id: Int
    let type: String
    let amount: Double
    let category: String
    let note: String
    let date: String
}

struct CategoryStat: Identifiable, Decodable {
    var id: String { category }
    let category: String
    let amount: Double
    let count: Int
}

struct DailyStat: Identifiable, Decodable {
    var id: String { date }
    let date: String
    let amount: Double
}

struct MonthStats: Decodable {
    let expenseTotal: Double
    let incomeTotal: Double
    let balance: Double
    let count: Int
    let byCategory: [CategoryStat]
    let daily: [DailyStat]
}

struct NewRecord: Encodable {
    let type: String
    let amount: Double
    let category: String
    let note: String
    let date: String
}

struct ApiErrorEnvelope: Decodable {
    struct APIError: Decodable {
        let message: String
    }
    let error: APIError
}

enum ApiError: LocalizedError {
    case message(String)

    var errorDescription: String? {
        switch self {
        case .message(let value):
            return value
        }
    }
}
