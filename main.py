# main.py - Главный файл запуска игры AbyssalEcho (нажмите Run ▶ в VS Code)
import sys
import os
import subprocess

# Автоматическая проверка и установка pygame при первом запуске
try:
    import pygame
except ModuleNotFoundError:
    print("\n" + "=" * 60)
    print("  [AbyssalEcho] Библиотека pygame не найдена.")
    print("  Выполняется автоматическая установка (pygame-ce, moderngl, numpy)...")
    print("  Пожалуйста, подождите 10-15 секунд...")
    print("=" * 60 + "\n")
    try:
        # pygame-ce поддерживает самые свежие версии Python (3.12, 3.13, 3.14+)
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pygame-ce", "moderngl", "numpy", "--break-system-packages"])
        import pygame
        print("[✓] Библиотеки успешно установлены!\n")
    except Exception:
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "pygame", "numpy", "--break-system-packages"])
            import pygame
            print("[✓] Библиотека pygame успешно установлена!\n")
        except Exception as err:
            print("\n[ОШИБКА АВТОУСТАНОВКИ]: " + str(err))
            print("Скопируйте и выполните в терминале VS Code команду:")
            print(f'"{sys.executable}" -m pip install pygame-ce --break-system-packages')
            sys.exit(1)

from config import WINDOW_WIDTH, WINDOW_HEIGHT, FPS, USE_MODERNGL
from engine import RenderEngine
from audio import SoundManager
from ui import MainMenu
from game import GameLevel

def main():
    print("=" * 60)
    print("  Запуск игры AbyssalEcho (ModernGL GPU Shaders + Pygame)")
    print("=" * 60)

    pygame.init()
    pygame.display.set_caption("AbyssalEcho - Plasma Combat Arena")

    # Установка иконки окна
    try:
        icon_surface = pygame.Surface((32, 32), pygame.SRCALPHA)
        pygame.draw.polygon(icon_surface, (232, 121, 249), [(16, 2), (30, 16), (16, 30), (2, 16)])
        pygame.draw.polygon(icon_surface, (255, 255, 255), [(16, 8), (24, 16), (16, 24), (8, 16)])
        pygame.display.set_icon(icon_surface)
    except Exception:
        pass

    # Аппаратный флаг OpenGL для ModernGL
    flags = pygame.OPENGL | pygame.DOUBLEBUF if USE_MODERNGL else 0
    try:
        display_surface = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT), flags)
        engine = RenderEngine(WINDOW_WIDTH, WINDOW_HEIGHT, use_moderngl=USE_MODERNGL)
        if engine.use_moderngl:
            print("[✓] Аппаратный GPU-шейдер ModernGL успешно активирован.")
        else:
            print("[i] Работаем в софтверном режиме Pygame.")
    except Exception as e:
        print(f"[i] ModernGL не инициализирован ({e}). Запуск в стандартном режиме Pygame.")
        display_surface = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
        engine = RenderEngine(WINDOW_WIDTH, WINDOW_HEIGHT, use_moderngl=False)

    clock = pygame.time.Clock()
    music_path = os.path.join(os.path.dirname(__file__), "level_music.wav")
    sound_manager = SoundManager(music_path)

    state = "MENU"
    current_game = None

    def start_level(level):
        nonlocal state, current_game
        current_game = GameLevel(level, return_to_menu, sound_manager, engine)
        state = "GAME"

    def return_to_menu():
        nonlocal state, current_game
        if current_game and sound_manager:
            sound_manager.stop_music()
        current_game = None
        state = "MENU"

    menu = MainMenu(start_level)
    running = True

    while running:
        dt = clock.tick(FPS) / 1000.0
        engine.update(dt)

        mouse_x, mouse_y = pygame.mouse.get_pos()

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif state == "MENU":
                if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    menu.handle_click(event.pos[0], event.pos[1])
            elif state == "GAME":
                if current_game:
                    current_game.handle_event(event)

        # Логика обновления
        if state == "MENU":
            menu.update()
            menu.draw(engine.game_surface, mouse_x, mouse_y)
        elif state == "GAME" and current_game:
            current_game.update()
            current_game.draw(engine.game_surface)

        # Вывод кадра через шейдерный движок
        engine.render(display_surface)

    if sound_manager:
        sound_manager.stop_music()
    pygame.quit()
    sys.exit()

if __name__ == "__main__":
    main()
