import SwiftUI

enum Palette {
    static let green = Color(red: 14.0 / 255.0, green: 159.0 / 255.0, blue: 110.0 / 255.0)
    static let greenDark = Color(red: 11.0 / 255.0, green: 122.0 / 255.0, blue: 90.0 / 255.0)
    static let red = Color(red: 224.0 / 255.0, green: 49.0 / 255.0, blue: 49.0 / 255.0)
    static let ink = Color(red: 31.0 / 255.0, green: 41.0 / 255.0, blue: 51.0 / 255.0)
    static let muted = Color(red: 107.0 / 255.0, green: 114.0 / 255.0, blue: 128.0 / 255.0)
    static let bg = Color(red: 245.0 / 255.0, green: 247.0 / 255.0, blue: 246.0 / 255.0)
    static let line = Color(red: 229.0 / 255.0, green: 231.0 / 255.0, blue: 235.0 / 255.0)
    static let chip = Color(red: 242.0 / 255.0, green: 245.0 / 255.0, blue: 243.0 / 255.0)
}

func money(_ value: Double) -> String {
    String(format: "%.2f", value)
}

func monthLabel(_ month: String) -> String {
    let parts = month.split(separator: "-")
    guard parts.count == 2 else { return month }
    return "\(parts[0])年\(Int(parts[1]) ?? 0)月"
}

func dateLabel(_ date: String) -> String {
    let parts = date.split(separator: "-")
    guard parts.count == 3 else { return date }
    return "\(Int(parts[1]) ?? 0)月\(Int(parts[2]) ?? 0)日"
}

func categoryEmoji(_ category: String) -> String {
    switch category {
    case "餐饮": return "🍜"
    case "交通": return "🚌"
    case "购物": return "🛍️"
    case "娱乐": return "🎮"
    case "居住": return "🏠"
    case "医疗": return "💊"
    case "其他": return "📦"
    case "工资": return "💰"
    case "奖金": return "🎁"
    case "理财": return "📈"
    case "兼职": return "💼"
    case "红包": return "🧧"
    default: return "💸"
    }
}

extension View {
    func moneyCard() -> some View {
        self
            .padding(16)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .shadow(color: Color.black.opacity(0.04), radius: 8, x: 0, y: 2)
    }
}
