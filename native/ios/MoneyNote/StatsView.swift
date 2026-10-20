import SwiftUI

struct StatsView: View {
    @ObservedObject var store: Store

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                MonthSwitcher(store: store)

                HStack(spacing: 12) {
                    StatCard(
                        title: "收入",
                        value: store.stats?.incomeTotal ?? 0,
                        color: Palette.green
                    )
                    StatCard(
                        title: "支出",
                        value: store.stats?.expenseTotal ?? 0,
                        color: Palette.red
                    )
                }

                Text("分类占比")
                    .font(.headline)
                    .padding(.top, 4)

                if let byCategory = store.stats?.byCategory, !byCategory.isEmpty {
                    CategorySection(items: byCategory)
                } else {
                    Text("这个月还没有支出记录")
                        .font(.subheadline)
                        .foregroundStyle(Palette.muted)
                }

                Text("每日支出")
                    .font(.headline)
                    .padding(.top, 4)

                DailyChart(daily: store.stats?.daily ?? [])
            }
            .padding(20)
        }
        .background(Palette.bg)
        .navigationTitle("统计")
        .refreshable { await store.load() }
    }
}

private struct CategorySection: View {
    let items: [CategoryStat]

    private var maxValue: Double {
        items.map(\.amount).max() ?? 1
    }

    var body: some View {
        ForEach(items) { item in
            CategoryRow(item: item, maxValue: maxValue)
        }
    }
}

private struct StatCard: View {
    let title: String
    let value: Double
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(Palette.muted)
            Text("¥\(money(value))")
                .font(.title3.weight(.bold))
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .moneyCard()
    }
}

private struct CategoryRow: View {
    let item: CategoryStat
    let maxValue: Double

    var body: some View {
        VStack(spacing: 6) {
            HStack {
                Text("\(categoryEmoji(item.category)) \(item.category)")
                    .font(.subheadline)
                Spacer()
                Text("¥\(money(item.amount))")
                    .font(.subheadline.weight(.medium))
                Text("\(item.count) 笔")
                    .font(.caption2)
                    .foregroundStyle(Palette.muted)
            }

            ProgressView(value: min(item.amount / max(maxValue, 0.01), 1))
                .tint(Palette.green)
        }
    }
}

private struct DailyChart: View {
    let daily: [DailyStat]

    private var maxValue: Double {
        max(daily.map(\.amount).max() ?? 1, 0.01)
    }

    var body: some View {
        if daily.isEmpty {
            Text("这个月还没有支出记录")
                .font(.subheadline)
                .foregroundStyle(Palette.muted)
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .bottom, spacing: 6) {
                    ForEach(daily) { item in
                        VStack(spacing: 4) {
                            RoundedRectangle(cornerRadius: 3)
                                .fill(Palette.green.opacity(0.75))
                                .frame(
                                    width: 10,
                                    height: CGFloat(max(4, item.amount / maxValue * 72))
                                )
                            Text(String(item.date.suffix(2)))
                                .font(.system(size: 9))
                                .foregroundStyle(Palette.muted)
                        }
                    }
                }
                .frame(height: 104, alignment: .bottom)
            }
        }
    }
}
