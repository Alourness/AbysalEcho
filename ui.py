# ui.py - Интерфейс главного меню и каменных плит
import math
import random
import pygame
from config import WINDOW_WIDTH, WINDOW_HEIGHT

class MainMenu:
    def __init__(self, on_select_level):
        self.on_select_level = on_select_level
        self.font_big = pygame.font.SysFont("Consolas", 44, bold=True)
        self.font_med = pygame.font.SysFont("Consolas", 18, bold=True)
        self.font_sub = pygame.font.SysFont("Consolas", 12, bold=True)
        self.font_desc = pygame.font.SysFont("Consolas", 11)
        self.anim_tick = 0

        # Плазменные пятна на фоне меню
        self.nebula_dots = []
        for _ in range(40):
            self.nebula_dots.append({
                "x": random.randint(0, WINDOW_WIDTH),
                "y": random.randint(0, WINDOW_HEIGHT),
                "vx": random.uniform(-0.5, 0.5),
                "vy": random.uniform(-0.5, 0.5),
                "sz": random.randint(2, 5),
                "col": random.choice([(168, 85, 247), (232, 121, 249), (217, 70, 239)])
            })

        self.menu_buttons = [
            {"lvl": 1, "name": "LEVEL 1", "roman": "I", "desc": "15 Врагов • Разминка на Арене", "rect": pygame.Rect(WINDOW_WIDTH // 2 - 160, 240, 320, 65)},
            {"lvl": 2, "name": "LEVEL 2", "roman": "II", "desc": "40 Врагов • Битва с Титаном", "rect": pygame.Rect(WINDOW_WIDTH // 2 - 160, 320, 320, 65)},
            {"lvl": 3, "name": "LEVEL 3", "roman": "III", "desc": "55 Врагов • 3 Босса + Элита", "rect": pygame.Rect(WINDOW_WIDTH // 2 - 160, 400, 320, 65)},
        ]

    def update(self):
        self.anim_tick += 1
        for d in self.nebula_dots:
            d["x"] += d["vx"]
            d["y"] += d["vy"]
            if d["x"] < 0: d["x"] = WINDOW_WIDTH
            if d["x"] > WINDOW_WIDTH: d["x"] = 0
            if d["y"] < 0: d["y"] = WINDOW_HEIGHT
            if d["y"] > WINDOW_HEIGHT: d["y"] = 0

    def draw(self, surface, mouse_x, mouse_y):
        surface.fill((8, 8, 14))

        # Частицы плазмы на фоне
        for d in self.nebula_dots:
            pygame.draw.circle(surface, d["col"], (int(d["x"]), int(d["y"])), d["sz"])

        # Базальтовый заголовок с плазменными трещинами
        title_text = "ABYSSAL ECHO"
        # Тень
        t_shadow = self.font_big.render(title_text, True, (40, 20, 60))
        surface.blit(t_shadow, (WINDOW_WIDTH // 2 - t_shadow.get_width() // 2 + 4, 114))
        # Каменный слой
        t_stone = self.font_big.render(title_text, True, (45, 45, 60))
        surface.blit(t_stone, (WINDOW_WIDTH // 2 - t_stone.get_width() // 2, 110))
        # Свечение трещин
        t_glow = self.font_big.render(title_text, True, (192, 132, 252))
        surface.blit(t_glow, (WINDOW_WIDTH // 2 - t_glow.get_width() // 2, 108))

        # Подзаголовок
        sub = self.font_sub.render("PLASMA COMBAT ARENA", True, (168, 85, 247))
        surface.blit(sub, (WINDOW_WIDTH // 2 - sub.get_width() // 2, 175))

        # Каменные кнопки уровней
        for btn in self.menu_buttons:
            is_hover = btn["rect"].collidepoint(mouse_x, mouse_y)
            rect = btn["rect"]

            # Плита
            bg_col = (25, 22, 45) if is_hover else (17, 17, 25)
            border_col = (232, 121, 249) if is_hover else (58, 58, 82)
            pygame.draw.rect(surface, bg_col, rect, border_radius=6)
            pygame.draw.rect(surface, border_col, rect, width=2, border_radius=6)

            # Плазменная трещина на плите
            ty = rect.centery
            pts = [
                (rect.left + 15, ty),
                (rect.left + 55, ty + 6),
                (rect.left + 110, ty - 6),
                (rect.left + 190, ty + 8),
                (rect.right - 15, ty - 2)
            ]
            crack_col = (192, 132, 252) if is_hover else (88, 28, 135)
            pygame.draw.lines(surface, crack_col, False, pts, 2)

            # Римская цифра
            rom = self.font_med.render(btn["roman"], True, (232, 121, 249) if is_hover else (140, 100, 180))
            surface.blit(rom, (rect.left + 22, rect.centery - rom.get_height() // 2))

            # Текст уровня
            txt_lvl = self.font_med.render(btn["name"], True, (255, 255, 255) if is_hover else (220, 220, 230))
            surface.blit(txt_lvl, (rect.left + 65, rect.top + 12))

            txt_desc = self.font_desc.render(btn["desc"], True, (216, 180, 254) if is_hover else (130, 130, 150))
            surface.blit(txt_desc, (rect.left + 65, rect.top + 36))

            # Стрелочка
            arr = self.font_med.render("→", True, (255, 255, 255) if is_hover else (120, 120, 140))
            surface.blit(arr, (rect.right - 35, rect.centery - arr.get_height() // 2))

    def handle_click(self, x, y):
        for btn in self.menu_buttons:
            if btn["rect"].collidepoint(x, y):
                self.on_select_level(btn["lvl"])
                return True
        return False
