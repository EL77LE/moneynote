package com.moneynote.nativeapp

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.Locale

data class MoneyRecord(
    val id: Long,
    val type: String,
    val amount: Double,
    val category: String,
    val note: String,
    val date: String,
)

data class CategoryStat(
    val category: String,
    val amount: Double,
    val count: Int,
)

data class DailyStat(
    val date: String,
    val amount: Double,
)

data class MonthStats(
    val expenseTotal: Double,
    val incomeTotal: Double,
    val balance: Double,
    val count: Int,
    val byCategory: List<CategoryStat>,
    val daily: List<DailyStat>,
)

data class NewRecord(
    val type: String,
    val amount: Double,
    val category: String,
    val note: String,
    val date: String,
)

class ApiException(message: String) : Exception(message)

/**
 * 原生 Android 的 API 客户端。
 *
 * 只用 JDK 自带的 HttpURLConnection + org.json，不引 Retrofit/OkHttp，
 * 这样工程里没有额外代码生成、没有注解处理器，读起来短，CI 也快。
 */
object ApiClient {
    private val baseUrl = BuildConfig.API_BASE_URL.trimEnd('/')

    suspend fun records(month: String): List<MoneyRecord> = withContext(Dispatchers.IO) {
        val json = JSONObject(request("/api/records?month=$month&limit=1000&offset=0"))
        val items = json.getJSONArray("items")
        buildList {
            for (i in 0 until items.length()) {
                val item = items.getJSONObject(i)
                add(
                    MoneyRecord(
                        id = item.getLong("id"),
                        type = item.getString("type"),
                        amount = item.getDouble("amount"),
                        category = item.getString("category"),
                        note = item.optString("note"),
                        date = item.getString("date"),
                    ),
                )
            }
        }
    }

    suspend fun stats(month: String): MonthStats = withContext(Dispatchers.IO) {
        val json = JSONObject(request("/api/stats?month=$month"))
        val byCategory = mutableListOf<CategoryStat>()
        val categoryArray = json.optJSONArray("byCategory") ?: JSONArray()
        for (i in 0 until categoryArray.length()) {
            val item = categoryArray.getJSONObject(i)
            byCategory.add(
                CategoryStat(
                    category = item.getString("category"),
                    amount = item.getDouble("amount"),
                    count = item.getInt("count"),
                ),
            )
        }
        val daily = mutableListOf<DailyStat>()
        val dailyArray = json.optJSONArray("daily") ?: JSONArray()
        for (i in 0 until dailyArray.length()) {
            val item = dailyArray.getJSONObject(i)
            daily.add(
                DailyStat(
                    date = item.getString("date"),
                    amount = item.getDouble("amount"),
                ),
            )
        }
        MonthStats(
            expenseTotal = json.getDouble("expenseTotal"),
            incomeTotal = json.getDouble("incomeTotal"),
            balance = json.getDouble("balance"),
            count = json.optInt("count"),
            byCategory = byCategory,
            daily = daily,
        )
    }

    suspend fun create(record: NewRecord): MoneyRecord = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("type", record.type)
            .put("amount", record.amount)
            .put("category", record.category)
            .put("note", record.note)
            .put("date", record.date)
            .toString()
        JSONObject(request("/api/records", method = "POST", body = body)).let { item ->
            MoneyRecord(
                id = item.getLong("id"),
                type = item.getString("type"),
                amount = item.getDouble("amount"),
                category = item.getString("category"),
                note = item.optString("note"),
                date = item.getString("date"),
            )
        }
    }

    private fun request(path: String, method: String = "GET", body: String? = null): String {
        val connection = URL("$baseUrl$path").openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = 10_000
        connection.readTimeout = 10_000
        connection.setRequestProperty("Accept", "application/json")
        if (body != null) {
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connection.outputStream.use { it.write(body.toByteArray(StandardCharsets.UTF_8)) }
        }

        val code = connection.responseCode
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        val text = stream?.bufferedReader(StandardCharsets.UTF_8)?.use { it.readText() } ?: ""
        connection.disconnect()

        if (code !in 200..299) {
            val message = runCatching {
                JSONObject(text).optJSONObject("error")?.optString("message")
            }.getOrNull().orEmpty().ifBlank { "接口返回 $code" }
            throw ApiException(message)
        }
        return text
    }
}

fun money(value: Double): String =
    String.format(Locale.CHINA, "%,.2f", value)

fun monthLabel(month: String): String {
    val year = month.substring(0, 4).toIntOrNull() ?: 0
    val mon = month.substring(5).toIntOrNull() ?: 0
    return "${year}年${mon}月"
}

fun dateLabel(date: String): String {
    if (date.length < 10) return date
    return "${date.substring(5, 7).toIntOrNull() ?: 0}月${date.substring(8, 10).toIntOrNull() ?: 0}日"
}

fun categoryEmoji(category: String): String = when (category) {
    "餐饮" -> "🍜"
    "交通" -> "🚌"
    "购物" -> "🛍️"
    "娱乐" -> "🎮"
    "居住" -> "🏠"
    "医疗" -> "💊"
    "其他" -> "📦"
    "工资" -> "💰"
    "奖金" -> "🎁"
    "理财" -> "📈"
    "兼职" -> "💼"
    "红包" -> "🧧"
    else -> "💸"
}

val expenseCategories = listOf("餐饮", "交通", "购物", "娱乐", "居住", "医疗", "其他")
val incomeCategories = listOf("工资", "奖金", "理财", "兼职", "红包")
