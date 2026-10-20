package com.moneynote.nativeapp

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val MoneyGreen = Color(0xFF0E9F6E)
val MoneyGreenDark = Color(0xFF0B7A5A)
val MoneyRed = Color(0xFFE03131)
val MoneyInk = Color(0xFF1F2933)
val MoneyMuted = Color(0xFF6B7280)
val MoneyBg = Color(0xFFF5F7F6)
val MoneyLine = Color(0xFFE5E7EB)

private val Colors = lightColorScheme(
    primary = MoneyGreen,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD1FAE5),
    onPrimaryContainer = Color(0xFF064E3B),
    secondary = MoneyGreenDark,
    onSecondary = Color.White,
    background = MoneyBg,
    onBackground = MoneyInk,
    surface = Color.White,
    onSurface = MoneyInk,
    error = MoneyRed,
)

@Composable
fun MoneyNoteTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Colors, content = content)
}
