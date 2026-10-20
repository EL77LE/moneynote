import SwiftUI

struct HomeView: View {
    @ObservedObject var store: Store

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                SummaryCard(stats: store.stats)
                MonthSwitcher(store: store)

                if let error = store.error {
                    ErrorCard(message: error) {
                        Task { await store.load() }
                    }
                }

                if store.loading && store.records.isEmpty {
                    ProgressView()
                        .tint(Palette.green)
                        .padding(48)
                }

                ForEach(store.records) { record in
                    RecordRow(record: record)
                }

                if !store.loading && store.records.isEmpty && store.error == nil {
                    VStack(spacing: 6) {
                        Text("这个月还没有记录")
                            .font(.subheadline.weight(.semibold))
                        Text("点右下角「记一笔」开始")
                            .font(.caption)
                            .foregroundStyle(Palette.muted)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(32)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 110)
        }
        .background(Palette.bg)
        .navigationTitle("MoneyNote")
        .navigationBarTitleDisplayMode(.large)
        .refreshable { await store.load() }
    }
}

struct MonthSwitcher: View {
    @ObservedObject var store: Store

    var body: some View {
        HStack {
            Button {
                Task { await store.shiftMonth(-1) }
            } label: {
                Image(systemName: "chevron.left")
                    .font(.headline)
                    .frame(width: 36, height: 36)
            }
            .disabled(store.loading)

            Spacer()

            Text(monthLabel(store.month))
                .font(.headline)
                .foregroundStyle(Palette.ink)

            Spacer()

            Button {
                Task { await store.shiftMonth(1) }
            } label: {
                Image(systemName: "chevron.right")
                    .font(.headline)
                    .frame(width: 36, height: 36)
            }
            .disabled(store.loading)
        }
        .buttonStyle(.plain)
        .foregroundStyle(Palette.green)
        .padding(.horizontal, 4)
    }
}

private struct SummaryCard: View {
    let stats: MonthStats?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("本月结余")
                .font(.caption)
                .foregroundStyle(.white.opacity(0.8))

            Text("¥\(money(stats?.balance ?? 0))")
                .font(.system(size: 34, weight: .bold))
                .foregroundStyle(.white)

            HStack(spacing: 32) {
                total("收入", stats?.incomeTotal ?? 0)
                total("支出", stats?.expenseTotal ?? 0)
            }
            .padding(.top, 12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(
            LinearGradient(
                colors: [Palette.green, Palette.greenDark],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func total(_ label: String, _ value: Double) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.72))
            Text("¥\(money(value))")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
        }
    }
}

private struct RecordRow: View {
    let record: MoneyRecord

    var body: some View {
        HStack(spacing: 12) {
            Text(categoryEmoji(record.category))
                .font(.title3)
                .frame(width: 42, height: 42)
                .background(Palette.bg)
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 4) {
                Text(record.note.isEmpty ? record.category : record.note)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)
                Text("\(record.category) · \(dateLabel(record.date))")
                    .font(.caption)
                    .foregroundStyle(Palette.muted)
            }

            Spacer()

            Text("\(record.type == "expense" ? "-" : "+")¥\(money(record.amount))")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(record.type == "expense" ? Palette.red : Palette.green)
        }
        .moneyCard()
    }
}

private struct ErrorCard: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("连不上后端")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Palette.red)
            Text(message)
                .font(.caption)
                .foregroundStyle(Palette.muted)
            Button("重试", action: onRetry)
                .font(.subheadline.weight(.semibold))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color(red: 1, green: 0.96, blue: 0.96))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
