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
class MoneyNoteStore {
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

    suspend fun load() {
        loading = true
        error = null
        try {
            records = ApiClient.records(month)
            stats = ApiClient.stats(month)
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
}
