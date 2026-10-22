package com.moneynote.nativeapp

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Insights
import androidx.compose.material.icons.outlined.ReceiptLong
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MoneyNoteRoot() {
    val store = remember { MoneyNoteStore(BuildConfig.DEMO_MODE) }

    LaunchedEffect(Unit) { store.load() }

    // 只给 CI 录屏用：启动后自动走一遍记一笔、统计、切月份。
    // 正常安装包 BuildConfig.DEMO_MODE = false，这段不会执行。
    LaunchedEffect(BuildConfig.DEMO_MODE) {
        if (!BuildConfig.DEMO_MODE) return@LaunchedEffect
        var waited = 0
        while (store.loading && waited < 30_000) {
            delay(300)
            waited += 300
        }
        delay(3_000)
        store.showAdd = true
        delay(9_000)
        store.showAdd = false
        store.tab = 1
        delay(8_000)
        store.shiftMonth(-1)
        delay(7_000)
        store.shiftMonth(1)
        delay(7_000)
        store.shiftMonth(-1)
        delay(8_000)
    }

    if (store.showAdd) {
        AddScreen(store = store, demoMode = BuildConfig.DEMO_MODE)
        return
    }

    Scaffold(
        containerColor = MoneyBg,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("MoneyNote", fontWeight = FontWeight.Bold)
                        Text(
                            "每一笔都算数",
                            style = MaterialTheme.typography.labelSmall,
                            color = MoneyMuted,
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White),
            )
        },
        bottomBar = {
            NavigationBar(containerColor = Color.White) {
                NavigationBarItem(
                    selected = store.tab == 0,
                    onClick = { store.tab = 0 },
                    icon = { androidx.compose.material3.Icon(Icons.Outlined.ReceiptLong, null) },
                    label = { Text("明细") },
                )
                NavigationBarItem(
                    selected = store.tab == 1,
                    onClick = { store.tab = 1 },
                    icon = { androidx.compose.material3.Icon(Icons.Outlined.Insights, null) },
                    label = { Text("统计") },
                )
            }
        },
        floatingActionButton = {
            if (store.tab == 0) {
                ExtendedFloatingActionButton(
                    onClick = { store.showAdd = true },
                    icon = { androidx.compose.material3.Icon(Icons.Outlined.Add, null) },
                    text = { Text("记一笔") },
                    containerColor = MoneyGreen,
                    contentColor = Color.White,
                )
            }
        },
    ) { padding ->
        if (store.tab == 0) {
            HomeScreen(store = store, padding = padding)
        } else {
            StatsScreen(store = store, padding = padding)
        }
    }
}

@Composable
private fun HomeScreen(store: MoneyNoteStore, padding: PaddingValues) {
    val scope = rememberCoroutineScope()
    val stats = store.stats

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(padding),
        contentPadding = PaddingValues(start = 20.dp, top = 8.dp, end = 20.dp, bottom = 96.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            SummaryCard(
                balance = stats?.balance ?: 0.0,
                income = stats?.incomeTotal ?: 0.0,
                expense = stats?.expenseTotal ?: 0.0,
            )
        }

        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                androidx.compose.material3.IconButton(
                    onClick = { scope.launch { store.shiftMonth(-1) } },
                    enabled = !store.loading,
                ) {
                    androidx.compose.material3.Icon(Icons.Outlined.ChevronLeft, "上个月")
                }
                Text(
                    monthLabel(store.month),
                    modifier = Modifier.weight(1f),
                    textAlign = TextAlign.Center,
                    fontWeight = FontWeight.SemiBold,
                    color = MoneyInk,
                )
                androidx.compose.material3.IconButton(
                    onClick = { scope.launch { store.shiftMonth(1) } },
                    enabled = !store.loading,
                ) {
                    androidx.compose.material3.Icon(Icons.Outlined.ChevronRight, "下个月")
                }
            }
        }

        if (store.error != null) {
            item {
                ErrorCard(message = store.error!!, onRetry = { scope.launch { store.load() } })
            }
        }

        if (store.loading && store.records.isEmpty()) {
            item {
                Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = MoneyGreen)
                }
            }
        }

        items(store.records, key = { it.id }) { record ->
            RecordRow(record)
        }

        if (!store.loading && store.records.isEmpty() && store.error == null) {
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                ) {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text("这个月还没有记录", fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(6.dp))
                        Text("点右下角「记一笔」开始", color = MoneyMuted, fontSize = 13.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun SummaryCard(balance: Double, income: Double, expense: Double) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(
            modifier = Modifier
                .background(Brush.linearGradient(listOf(MoneyGreen, MoneyGreenDark)))
                .padding(20.dp),
        ) {
            Text("本月结余", color = Color.White.copy(alpha = 0.80f), fontSize = 13.sp)
            Spacer(Modifier.height(4.dp))
            Text("¥${money(balance)}", color = Color.White, fontSize = 32.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(16.dp))
            Row {
                SmallTotal("收入", income, Modifier.weight(1f))
                SmallTotal("支出", expense, Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun SmallTotal(label: String, value: Double, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(label, color = Color.White.copy(alpha = 0.72f), fontSize = 12.sp)
        Text(
            "¥${money(value)}",
            color = Color.White,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun RecordRow(record: MoneyRecord) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier.size(42.dp).clip(CircleShape).background(MoneyBg),
                contentAlignment = Alignment.Center,
            ) {
                Text(categoryEmoji(record.category), fontSize = 20.sp)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    record.note.ifBlank { record.category },
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    "${record.category} · ${dateLabel(record.date)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MoneyMuted,
                )
            }
            Text(
                (if (record.type == "expense") "-" else "+") + "¥" + money(record.amount),
                color = if (record.type == "expense") MoneyRed else MoneyGreen,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun ErrorCard(message: String, onRetry: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF5F5)),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text("连不上后端", fontWeight = FontWeight.SemiBold, color = MoneyRed)
            Spacer(Modifier.height(4.dp))
            Text(message, fontSize = 13.sp, color = MoneyMuted)
            Spacer(Modifier.height(8.dp))
            Button(onClick = onRetry) { Text("重试") }
        }
    }
}

@Composable
private fun StatsScreen(store: MoneyNoteStore, padding: PaddingValues) {
    val scope = rememberCoroutineScope()
    val stats = store.stats

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(padding),
        contentPadding = PaddingValues(start = 20.dp, top = 8.dp, end = 20.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                androidx.compose.material3.IconButton(
                    onClick = { scope.launch { store.shiftMonth(-1) } },
                    enabled = !store.loading,
                ) {
                    androidx.compose.material3.Icon(Icons.Outlined.ChevronLeft, "上个月")
                }
                Text(
                    monthLabel(store.month),
                    modifier = Modifier.weight(1f),
                    textAlign = TextAlign.Center,
                    fontWeight = FontWeight.SemiBold,
                )
                androidx.compose.material3.IconButton(
                    onClick = { scope.launch { store.shiftMonth(1) } },
                    enabled = !store.loading,
                ) {
                    androidx.compose.material3.Icon(Icons.Outlined.ChevronRight, "下个月")
                }
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard("收入", stats?.incomeTotal ?: 0.0, MoneyGreen, Modifier.weight(1f))
                StatCard("支出", stats?.expenseTotal ?: 0.0, MoneyRed, Modifier.weight(1f))
            }
        }

        item {
            SectionTitle("分类占比")
        }

        if (stats == null || stats.byCategory.isEmpty()) {
            item {
                Text("这个月还没有支出记录", color = MoneyMuted)
            }
        } else {
            items(stats.byCategory) { category ->
                CategoryBar(category, stats.byCategory.maxOf { it.amount })
            }
        }

        item {
            SectionTitle("每日支出")
        }

        item {
            DailyBars(stats?.daily.orEmpty())
        }
    }
}

@Composable
private fun StatCard(label: String, value: Double, color: Color, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(label, color = MoneyMuted, fontSize = 12.sp)
            Spacer(Modifier.height(4.dp))
            Text("¥${money(value)}", color = color, fontWeight = FontWeight.Bold, fontSize = 20.sp)
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text,
        modifier = Modifier.padding(top = 4.dp),
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
        color = MoneyInk,
    )
}

@Composable
private fun CategoryBar(item: CategoryStat, max: Double) {
    val fraction = if (max <= 0) 0f else (item.amount / max).toFloat().coerceIn(0f, 1f)
    Column(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("${categoryEmoji(item.category)} ${item.category}", fontSize = 13.sp)
            Spacer(Modifier.weight(1f))
            Text("¥${money(item.amount)}", fontSize = 13.sp, fontWeight = FontWeight.Medium)
            Spacer(Modifier.width(6.dp))
            Text("${item.count} 笔", fontSize = 11.sp, color = MoneyMuted)
        }
        Spacer(Modifier.height(6.dp))
        Box(
            Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)).background(MoneyLine),
        ) {
            Box(
                Modifier
                    .fillMaxWidth(fraction)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(4.dp))
                    .background(MoneyGreen),
            )
        }
    }
}

@Composable
private fun DailyBars(daily: List<DailyStat>) {
    if (daily.isEmpty()) {
        Text("这个月还没有支出记录", color = MoneyMuted)
        return
    }
    val max = daily.maxOf { it.amount }.coerceAtLeast(0.01)
    Row(
        modifier = Modifier.fillMaxWidth().height(110.dp).horizontalScroll(rememberScrollState()),
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        daily.forEach { item ->
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    Modifier
                        .width(10.dp)
                        .height(((item.amount / max) * 72 + 4).toFloat().dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(MoneyGreen.copy(alpha = 0.75f)),
                )
                Spacer(Modifier.height(4.dp))
                Text(item.date.takeLast(2), fontSize = 9.sp, color = MoneyMuted)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddScreen(store: MoneyNoteStore, demoMode: Boolean) {
    var type by remember { mutableStateOf("expense") }
    var amount by remember { mutableStateOf(if (demoMode) "25.5" else "") }
    var category by remember { mutableStateOf("餐饮") }
    var note by remember { mutableStateOf(if (demoMode) "午饭" else "") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    suspend fun save() {
        if (saving) return
        val value = amount.toDoubleOrNull()
        if (value == null || value < 0.01) {
            error = "金额至少 0.01 元"
            return
        }
        saving = true
        error = null
        try {
            store.add(type, value, category, note)
            store.showAdd = false
        } catch (e: Exception) {
            error = e.message ?: "保存失败"
        } finally {
            saving = false
        }
    }

    LaunchedEffect(demoMode) {
        if (demoMode) {
            delay(3_500)
            save()
        }
    }

    Scaffold(
        containerColor = MoneyBg,
        topBar = {
            TopAppBar(
                title = { Text("记一笔", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    androidx.compose.material3.IconButton(onClick = { store.showAdd = false }) {
                        androidx.compose.material3.Icon(Icons.Outlined.ArrowBack, "返回")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White),
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                FilterChip(
                    selected = type == "expense",
                    onClick = {
                        type = "expense"
                        category = "餐饮"
                    },
                    label = { Text("支出") },
                )
                FilterChip(
                    selected = type == "income",
                    onClick = {
                        type = "income"
                        category = "工资"
                    },
                    label = { Text("收入") },
                )
            }

            OutlinedTextField(
                value = amount,
                onValueChange = { amount = it.filter { ch -> ch.isDigit() || ch == '.' } },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("金额") },
                leadingIcon = { Text("¥", fontWeight = FontWeight.SemiBold) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Decimal,
                    imeAction = ImeAction.Next,
                ),
                isError = error != null,
            )

            Text("分类", fontSize = 13.sp, color = MoneyMuted)
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                (if (type == "expense") expenseCategories else incomeCategories).forEach { item ->
                    FilterChip(
                        selected = category == item,
                        onClick = { category = item },
                        label = { Text("${categoryEmoji(item)} $item") },
                    )
                }
            }

            OutlinedTextField(
                value = note,
                onValueChange = { note = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("备注（可选）") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            )

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("日期", color = MoneyMuted, fontSize = 13.sp)
                    Spacer(Modifier.weight(1f))
                    Text(java.time.LocalDate.now().toString(), fontWeight = FontWeight.Medium)
                }
            }

            if (error != null) {
                Text(error!!, color = MoneyRed, fontSize = 13.sp)
            }

            Button(
                onClick = { scope.launch { save() } },
                modifier = Modifier.fillMaxWidth().height(52.dp),
                enabled = !saving,
                shape = RoundedCornerShape(14.dp),
            ) {
                if (saving) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(22.dp),
                        color = Color.White,
                        strokeWidth = 2.dp,
                    )
                } else {
                    Text("保存", fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                }
            }

            if (demoMode) {
                Text(
                    "演示模式：3.5 秒后自动保存",
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center,
                    fontSize = 11.sp,
                    color = MoneyMuted,
                )
            }
        }
    }
}
