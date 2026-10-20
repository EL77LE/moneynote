import SwiftUI

struct RootView: View {
    @StateObject private var store = Store()
    private var demoMode: Bool { CommandLine.arguments.contains("--demo") }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            TabView(selection: $store.tab) {
                NavigationStack {
                    HomeView(store: store)
                }
                .tag(0)
                .tabItem {
                    Label("明细", systemImage: "list.bullet.rectangle")
                }

                NavigationStack {
                    StatsView(store: store)
                }
                .tag(1)
                .tabItem {
                    Label("统计", systemImage: "chart.bar.xaxis")
                }
            }
            .tint(Palette.green)

            if store.tab == 0 {
                Button {
                    store.showAdd = true
                } label: {
                    Label("记一笔", systemImage: "plus")
                        .font(.headline)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 14)
                        .background(Palette.green)
                        .clipShape(Capsule())
                        .shadow(color: Palette.green.opacity(0.35), radius: 10, x: 0, y: 5)
                }
                .padding(.trailing, 20)
                .padding(.bottom, 76)
            }
        }
        .sheet(isPresented: $store.showAdd) {
            AddView(store: store, demoMode: demoMode)
        }
        .preferredColorScheme(.light)
        .task {
            await store.load()
            await runDemoIfNeeded()
        }
    }

    /// 只给 CI 录屏用。启动参数带 --demo 时，自动走一遍完整功能。
    private func runDemoIfNeeded() async {
        guard demoMode else { return }

        var waited = 0
        while store.loading && waited < 30_000 {
            try? await Task.sleep(nanoseconds: 300_000_000)
            waited += 300
        }

        try? await Task.sleep(nanoseconds: 3_000_000_000)
        store.showAdd = true

        try? await Task.sleep(nanoseconds: 9_000_000_000)
        store.showAdd = false
        store.tab = 1

        try? await Task.sleep(nanoseconds: 8_000_000_000)
        await store.shiftMonth(-1)

        try? await Task.sleep(nanoseconds: 7_000_000_000)
        await store.shiftMonth(1)

        try? await Task.sleep(nanoseconds: 7_000_000_000)
        await store.shiftMonth(-1)

        try? await Task.sleep(nanoseconds: 8_000_000_000)
    }
}
