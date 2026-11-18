# config.py - Настройки и константы игры AbyssalEcho

WINDOW_WIDTH = 900
WINDOW_HEIGHT = 700
FPS = 60

# Цвета интерфейса и темы
BG_COLOR = (5, 5, 8)
UI_BG_COLOR = (18, 18, 24)
BORDER_COLOR = (42, 42, 56)
STONE_WALL_COLOR = (36, 36, 48)

# Физика игрока
PLAYER_BASE_SPEED = 5.0
PLAYER_RAM_MULTIPLIER = 1.4

# Параметры кулдауна урона (2 секунды при 60 FPS)
DAMAGE_COOLDOWN_TICKS = 120

# Графический режим (ModernGL GPU шейдеры с автоматическим откатом на Pygame)
USE_MODERNGL = True
