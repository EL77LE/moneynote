package com.moneynote.nativeapp

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.time.LocalDate
import java.time.YearMonth

/**
 * 一个页面级的轻量状态容器。
 *
 * 这个 demo 只有两个 Tab，没必要上 ViewModel/Hilt/Room。
 * 用 Compose 的 mutableStateOf 足够，代码少，面试时也讲得清。
 */
class MoneyNoteStore(private val demoMode: Boolean = false) {
    var month by mutableStateOf(YearMonth.now().toString())
        private set

    var records by mutableStateOf<List<MoneyRecord>>(emptyList())
        private set

    var stats by mutableStateOf<MonthStats?>(null)
        private set

    var loading by mutableStateOf(true)
        private set

    var error by mutableStateOf<String?>(null)
        private set

    var tab by mutableStateOf(0)
    var showAdd by mutableStateOf(false)

    private val demoRecords = mutableListOf<MoneyRecord>()
    private var nextDemoId = 1000L

    init {
        if (demoMode) seedDemoRecords()
    }

    suspend fun load() {
        loading = true
        error = null
        try {
            if (demoMode) {
                // 录屏专用：完全使用本地演示数据，避免模拟器网络慢导致流程卡住。
                // 正常 APK 的 DEMO_MODE=false，仍然请求真实后端。
                records = demoRecords.filter { it.date.startsWith(month) }
                stats = buildStats(records)
            } else {
                records = ApiClient.records(month)
                stats = ApiClient.stats(month)
            }
        } catch (e: Exception) {
            error = e.message ?: "连不上后端"
        } finally {
            loading = false
        }
    }

    suspend fun shiftMonth(delta: Long) {
        month = YearMonth.parse(month).plusMonths(delta).toString()
        load()
    }

    suspend fun add(type: String, amount: Double, category: String, note: String) {
        if (demoMode) {
            demoRecords += MoneyRecord(
                id = nextDemoId++,
                type = type,
                amount = amount,
                category = category,
                note = note,
                date = LocalDate.now().toString(),
            )
            load()
            return
        }
        ApiClient.create(
            NewRecord(
                type = type,
                amount = amount,
                category = category,
                note = note,
                date = LocalDate.now().toString(),
            ),
        )
        load()
    }

    private fun seedDemoRecords() {
        val current = YearMonth.now()
        val previous = current.minusMonths(1)
        demoRecords += listOf(
            MoneyRecord(1, "expense", 38.0, "餐饮", "午饭", current.atDay(3).toString()),
            MoneyRecord(2, "expense", 12.0, "交通", "地铁", current.atDay(5).toString()),
            MoneyRecord(3, "expense", 128.0, "购物", "日用品", current.atDay(8).toString()),
            MoneyRecord(4, "income", 12000.0, "工资", "本月工资", current.atDay(10).toString()),
            MoneyRecord(5, "expense", 56.0, "娱乐", "电影", current.atDay(12).toString()),
            MoneyRecord(6, "expense", 25.5, "餐饮", "午饭", current.atDay(18).toString()),
            MoneyRecord(7, "expense", 32.0, "餐饮", "咖啡", current.atDay(21).toString()),
            MoneyRecord(8, "expense", 88.0, "居住", "水电", current.atDay(22).toString()),
            MoneyRecord(101, "expense", 42.0, "餐饮", "上月午饭", previous.atDay(15).toString()),
            MoneyRecord(102, "income", 11000.0, "工资", "上月工资", previous.atDay(10).toString()),
        )
    }

    private fun buildStats(items: List<MoneyRecord>): MonthStats {
        val expenses = items.filter { it.type == "expense" }
        val expenseTotal = expenses.sumOf { it.amount }
        val incomeTotal = items.filter { it.type == "income" }.sumOf { it.amount }
        val byCategory = expenses
            .groupBy { it.category }
            .map { (category, rows) ->
                CategoryStat(
                    category = category,
                    amount = rows.sumOf { it.amount },
                    count = rows.size,
                )
            }
            .sortedByDescending { it.amount }
        val daily = expenses
            .groupBy { it.date }
            .map { (date, rows) -> DailyStat(date, rows.sumOf { it.amount }) }
            .sortedBy { it.date }
        return MonthStats(
            expenseTotal = expenseTotal,
            incomeTotal = incomeTotal,
            balance = incomeTotal - expenseTotal,
            count = items.size,
            byCategory = byCategory,
            daily = daily,
        )
    }
}
