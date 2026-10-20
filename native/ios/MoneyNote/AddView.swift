import SwiftUI

struct AddView: View {
    @ObservedObject var store: Store
    let demoMode: Bool

    @Environment(\.dismiss) private var dismiss
    @State private var type = "expense"
    @State private var amount: String
    @State private var category = "餐饮"
    @State private var note: String
    @State private var saving = false
    @State private var error: String?

    init(store: Store, demoMode: Bool) {
        self.store = store
        self.demoMode = demoMode
        _amount = State(initialValue: demoMode ? "25.5" : "")
        _note = State(initialValue: demoMode ? "午饭" : "")
    }

    private var categories: [String] {
        type == "expense"
            ? ["餐饮", "交通", "购物", "娱乐", "居住", "医疗", "其他"]
            : ["工资", "奖金", "理财", "兼职", "红包"]
    }

    private var typeBinding: Binding<String> {
        Binding(
            get: { type },
            set: { value in
                type = value
                category = value == "expense" ? "餐饮" : "工资"
            }
        )
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("类型", selection: typeBinding) {
                        Text("支出").tag("expense")
                        Text("收入").tag("income")
                    }
                    .pickerStyle(.segmented)
                }

                Section("金额") {
                    HStack {
                        Text("¥")
                            .foregroundStyle(Palette.muted)
                        TextField("0.00", text: $amount)
                            .keyboardType(.decimalPad)
                            .font(.title2.weight(.semibold))
                    }
                }

                Section("分类") {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(categories, id: \.self) { item in
                                Button {
                                    category = item
                                } label: {
                                    Text("\(categoryEmoji(item)) \(item)")
                                        .font(.subheadline)
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 8)
                                        .background(category == item ? Palette.green.opacity(0.15) : Palette.chip)
                                        .foregroundStyle(category == item ? Palette.green : Palette.ink)
                                        .clipShape(Capsule())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                Section("备注") {
                    TextField("午饭、地铁、房租…", text: $note)
                }

                Section {
                    HStack {
                        Text("日期")
                        Spacer()
                        Text(Store.today())
                            .foregroundStyle(Palette.muted)
                    }
                }

                if let error {
                    Section {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(Palette.red)
                    }
                }

                Section {
                    Button {
                        Task { await save() }
                    } label: {
                        HStack {
                            Spacer()
                            Text(saving ? "保存中…" : "保存")
                                .font(.headline)
                            Spacer()
                        }
                    }
                    .disabled(saving)
                }
            }
            .navigationTitle("记一笔")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .task {
                if demoMode {
                    try? await Task.sleep(nanoseconds: 3_500_000_000)
                    await save()
                }
            }
        }
    }

    private func save() async {
        guard !saving else { return }
        guard let value = Double(amount), value >= 0.01 else {
            error = "金额至少 0.01 元"
            return
        }

        saving = true
        error = nil
        do {
            try await store.add(type: type, amount: value, category: category, note: note)
            dismiss()
        } catch let err {
            error = err.localizedDescription
        }
        saving = false
    }
}
