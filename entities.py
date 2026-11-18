# entities.py - Игрок и Враги с полной физикой, геометрией и ИИ
import math
import random
import pygame

class Player:
    def __init__(self, x=450, y=375):
        self.x = float(x)
        self.y = float(y)
        self.size = 16
        self.invulnerability_timer = 0
        self.colors = [
            (192, 132, 252),
            (232, 121, 249),
            (168, 85, 247),
            (216, 180, 254)
        ]

    def update(self):
        if self.invulnerability_timer > 0:
            self.invulnerability_timer -= 1

    def draw(self, surface, anim_tick):
        # Если действует неуязвимость (кулдаун урона 2 сек), мигаем
        if self.invulnerability_timer > 0 and (anim_tick // 4) % 2 == 0:
            # Рисуем фиолетовые молнии защиты вокруг игрока
            for _ in range(2):
                ox = self.x + random.uniform(-22, 22)
                oy = self.y + random.uniform(-22, 22)
                pygame.draw.line(surface, (192, 132, 252), (self.x, self.y), (ox, oy), 2)
            return

        ps = self.size
        pulse = math.sin(anim_tick * 0.15) * 3

        # Внешний пульсирующий контур
        p_outer = [
            (self.x, self.y - (ps + 4 + pulse)),
            (self.x + (ps + 4 + pulse), self.y),
            (self.x, self.y + (ps + 4 + pulse)),
            (self.x - (ps + 4 + pulse), self.y)
        ]
        pygame.draw.polygon(surface, (232, 121, 249), p_outer, width=2)

        # Тело ромба с циклической плазмой
        p_body = [
            (self.x, self.y - ps),
            (self.x + ps, self.y),
            (self.x, self.y + ps),
            (self.x - ps, self.y)
        ]
        color_idx = (anim_tick // 4) % len(self.colors)
        pygame.draw.polygon(surface, self.colors[color_idx], p_body)
        pygame.draw.polygon(surface, (243, 232, 255), p_body, width=1)

        # Белое ядро энергии
        p_core = [
            (self.x, self.y - ps * 0.4),
            (self.x + ps * 0.4, self.y),
            (self.x, self.y + ps * 0.4),
            (self.x - ps * 0.4, self.y)
        ]
        pygame.draw.polygon(surface, (255, 255, 255), p_core)


class Enemy:
    def __init__(self, x, y, is_elite=False):
        self.x = float(x)
        self.y = float(y)
        self.is_elite = is_elite
        self.base_speed = random.uniform(1.0, 1.8) if not is_elite else 2.2
        self.speed = 1.5
        self.offset = random.uniform(0, 6.28)
        self.timer = random.randint(40, 100)
        self.mode = "flank"  # flank | rush | retreat | circle
        self.shoot_timer = random.randint(60, 120) if is_elite else 9999
        self.is_ramming = False
        self.ram_timer = 0

        self.e_cols = [
            (239, 68, 68),
            (249, 115, 22),
            (220, 38, 38),
            (185, 28, 28)
        ]

    def update(self, player_x, player_y, spawn_counter):
        self.timer -= 1
        if self.timer <= 0:
            self.timer = random.randint(40, 100)
            self.mode = random.choice(["flank", "rush", "retreat", "circle"])
            self.base_speed = random.uniform(0.9, 2.0) if not self.is_elite else random.uniform(1.8, 2.6)

        dist = math.hypot(player_x - self.x, player_y - self.y)
        base_angle = math.atan2(player_y - self.y, player_x - self.x)

        if self.is_ramming:
            self.ram_timer -= 1
            if self.ram_timer <= 0:
                self.is_ramming = False
            spd = self.base_speed * 2.5
            self.x += math.cos(base_angle) * spd
            self.y += math.sin(base_angle) * spd
            return None

        if self.mode == "flank":
            angle = base_angle + math.sin(spawn_counter * 0.06 + self.offset) * 1.4
        elif self.mode == "rush":
            angle = base_angle
        elif self.mode == "retreat" and dist < 160:
            angle = base_angle + math.pi
        elif self.mode == "circle":
            angle = base_angle + math.pi / 2
        else:
            angle = base_angle

        spd = self.base_speed * (1.5 if self.mode == "rush" else 1.0)
        self.x += math.cos(angle) * spd
        self.y += math.sin(angle) * spd

        # Элитный стрелок
        bullet = None
        if self.is_elite:
            self.shoot_timer -= 1
            if self.shoot_timer <= 0:
                self.shoot_timer = random.randint(90, 150)
                # Выстрел или рывок
                if random.random() < 0.4:
                    self.is_ramming = True
                    self.ram_timer = 30
                else:
                    bullet = {
                        "x": self.x, "y": self.y,
                        "dx": math.cos(base_angle) * 7.0,
                        "dy": math.sin(base_angle) * 7.0,
                        "life": 80,
                        "is_boss": False,
                        "is_enemy_bolt": True,
                        "color": (239, 68, 68)
                    }

        return bullet

    def draw(self, surface, anim_tick):
        sz = 12 if self.is_elite else 9
        e_pulse = math.sin(anim_tick * 0.2 + self.offset) * 2

        # Внешний контур
        outer_rect = pygame.Rect(self.x - sz - 2 - e_pulse, self.y - sz - 2 - e_pulse, (sz + 2) * 2 + e_pulse * 2, (sz + 2) * 2 + e_pulse * 2)
        pygame.draw.rect(surface, (239, 68, 68), outer_rect, width=1)

        # Тело врага
        col = self.e_cols[(anim_tick // 3) % len(self.e_cols)]
        body_rect = pygame.Rect(self.x - sz, self.y - sz, sz * 2, sz * 2)
        pygame.draw.rect(surface, col, body_rect)
        pygame.draw.rect(surface, (252, 165, 165), body_rect, width=1)

        # Ядро
        core_sz = sz // 2
        core_rect = pygame.Rect(self.x - core_sz // 2, self.y - core_sz // 2, core_sz, core_sz)
        pygame.draw.rect(surface, (254, 240, 138), core_rect)

        # Аура рывка
        if self.is_ramming:
            pygame.draw.circle(surface, (249, 115, 22), (int(self.x), int(self.y)), sz + 10, width=2)
