import pygame
from config import WINDOW_WIDTH

class MainMenu:
    def __init__(self, surface, on_select_level, font, font_big):
        self.surface = surface
        self.on_select_level = on_select_level
        self.font = font
        self.font_big = font_big
        self.menu_buttons = []
        self.create_menu()

    def create_menu(self):
        self.menu_buttons = []
        for i in range(1, 4):
            btn_y = 220 + (i - 1) * 90
            is_unlocked = (i <= 2)
            self.menu_buttons.append({
                "level": i, 
                "x1": WINDOW_WIDTH/2 - 140, "y1": btn_y, 
                "x2": WINDOW_WIDTH/2 + 140, "y2": btn_y + 70,
                "unlocked": is_unlocked
            })

    def draw(self, mouse_x, mouse_y):
        self.surface.fill((10, 10, 15))
        
        title = self.font_big.render("ABYSSAL ECHO", True, (243, 232, 255))
        self.surface.blit(title, (WINDOW_WIDTH/2 - title.get_width()/2, 120))
        
        for btn in self.menu_buttons:
            is_hover = btn["unlocked"] and btn["x1"] <= mouse_x <= btn["x2"] and btn["y1"] <= mouse_y <= btn["y2"]
            fill = (30, 27, 75) if is_hover else (18, 18, 28)
            outline = (232, 121, 249) if is_hover else (168, 85, 247)
            
            pygame.draw.rect(self.surface, fill, (btn["x1"], btn["y1"], btn["x2"] - btn["x1"], btn["y2"] - btn["y1"]))
            pygame.draw.rect(self.surface, outline, (btn["x1"], btn["y1"], btn["x2"] - btn["x1"], btn["y2"] - btn["y1"]), 2)
            
            text_str = f"LEVEL {btn['level']}" if btn["unlocked"] else f"LEVEL {btn['level']} (LOCKED)"
            text_col = (216, 180, 254) if btn["unlocked"] else (68, 51, 85)
            
            txt = self.font.render(text_str, True, text_col)
            self.surface.blit(txt, (WINDOW_WIDTH/2 - txt.get_width()/2, btn["y1"] + 25))

    def handle_click(self, x, y):
        for btn in self.menu_buttons:
            if btn["unlocked"] and btn["x1"] <= x <= btn["x2"] and btn["y1"] <= y <= btn["y2"]:
                self.on_select_level(btn["level"])
                return True
        return False