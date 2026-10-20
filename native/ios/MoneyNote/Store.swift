import Foundation
import SwiftUI

@MainActor
final class Store: ObservableObject {
    @Published var month = Store.currentMonth()
    @Published var records: [MoneyRecord] = []
    @Published var stats: MonthStats?
    @Published var loading = true
    @Published var error: String?
    @Published var tab = 0
    @Published var showAdd = false

    func load() async {
        loading = true
        error = nil
        do {
            let records = try await ApiClient.records(month: month)
            let stats = try await ApiClient.stats(month: month)
            self.records = records
            self.stats = stats
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    func shiftMonth(_ delta: Int) async {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM"
        guard let date = formatter.date(from: month),
              let shifted = Calendar.current.date(byAdding: .month, value: delta, to: date) else {
            return
        }
        month = formatter.string(from: shifted)
        await load()
    }

    func add(type: String, amount: Double, category: String, note: String) async throws {
        let record = NewRecord(
            type: type,
            amount: amount,
            category: category,
            note: note,
            date: Store.today()
        )
        _ = try await ApiClient.create(record)
        await load()
    }

    static func currentMonth() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM"
        return formatter.string(from: Date())
    }

    static func today() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }
}
