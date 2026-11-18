# boss.py - Боссы (Титаны Бездны и Владыка Эгида)
import math
import random
import pygame
from config import WINDOW_WIDTH, WINDOW_HEIGHT

class Boss:
    def __init__(self, x, y, name="ABYSSAL TITAN", color=(239, 68, 68), hp=28.0):
        self.x = float(x)
        self.y = float(y)
        self.name = name
        self.color = color
        self.hp = float(hp)
        self.max_hp = float(hp)
        self.size = 32

        self.speed = 0.85
        self.attack_cooldown = 140
        self.attack_timer = random.randint(40, 80)
        self.is_warning = False
        self.warning_ticks = 0
        self.current_aim_angle = 0.0

    def update(self, player_x, player_y, particles):
        # Движение к игроку
        angle = math.atan2(player_y - self.y, player_x - self.x)
        self.x += math.cos(angle) * self.speed
        self.y += math.sin(angle) * self.speed

        self.x = max(55.0, min(WINDOW_WIDTH - 55.0, self.x))
        self.y = max(110.0, min(WINDOW_HEIGHT - 55.0, self.y))

        res_laser = None
        if not self.is_warning:
            self.attack_timer -= 1
            if self.attack_timer <= 0:
                self.is_warning = True
                self.warning_ticks = 60
                self.current_aim_angle = math.atan2(player_y - self.y, player_x - self.x)
        else:
            self.warning_ticks -= 1
            desired_angle = math.atan2(player_y - self.y, player_x - self.x)
            diff = (desired_angle - self.current_aim_angle + math.pi) % (2 * math.pi) - math.pi

            max_turn_speed = 0.015
            if abs(diff) > max_turn_speed:
                self.current_aim_angle += max_turn_speed if diff > 0 else -max_turn_speed
            else:
                self.current_aim_angle = desired_angle

            if self.warning_ticks <= 0:
                self.is_warning = False
                self.attack_timer = self.attack_cooldown
                res_laser = {
                    "x": self.x, "y": self.y,
                    "angle": self.current_aim_angle,
                    "life": 42, "is_boss": True,
                    "color": self.color
                }

        return res_laser

    def take_damage(self, amount, particles):
        self.hp -= amount
        for _ in range(3):
            particles.append({
                "x": self.x, "y": self.y,
                "dx": random.uniform(-4, 4), "dy": random.uniform(-4, 4),
                "life": 12, "color": self.color
            })
        return self.hp <= 0

    def draw(self, surface):
        sz = self.size
        # Внешний контур
        pygame.draw.rect(surface, self.color, pygame.Rect(self.x - sz - 6, self.y - sz - 6, (sz + 6) * 2, (sz + 6) * 2), width=3)
        # Тело босса
        pygame.draw.rect(surface, (80, 20, 20), pygame.Rect(self.x - sz, self.y - sz, sz * 2, sz * 2))
        pygame.draw.rect(surface, (252, 165, 165), pygame.Rect(self.x - sz, self.y - sz, sz * 2, sz * 2), width=2)
        # Ядро босса
        core_sz = sz // 2
        pygame.draw.rect(surface, self.color, pygame.Rect(self.x - core_sz // 2, self.y - core_sz // 2, core_sz, core_sz))
        pygame.draw.rect(surface, (255, 255, 255), pygame.Rect(self.x - core_sz // 2, self.y - core_sz // 2, core_sz, core_sz), width=1)

        # Предупреждающий луч прицела
        if self.is_warning:
            length = 1500
            lx2 = self.x + math.cos(self.current_aim_angle) * length
            ly2 = self.y + math.sin(self.current_aim_angle) * length
            pygame.draw.line(surface, self.color, (self.x, self.y), (lx2, ly2), 2)


class AegisOverlordBoss:
    """Особенный третий босс 3 уровня с вращающимся барьером, рывками и круговыми волнами взрывов"""
    def __init__(self, x, y):
        self.x = float(x)
        self.y = float(y)
        self.name = "AEGIS OVERLORD"
        self.color = (217, 70, 239)
        self.hp = 38.0
        self.max_hp = 38.0
        self.size = 36

        self.speed = 1.1
        self.barrier_angle = 0.0
        self.dash_cooldown = 180
        self.dash_timer = 0
        self.is_dashing = False
        self.nova_cooldown = 240
        self.nova_timer = 120

    def update(self, player_x, player_y, particles):
        self.barrier_angle += 0.04
        self.nova_timer -= 1
        res_projectiles = []

        # Радиальная взрывная волна
        if self.nova_timer <= 0:
            self.nova_timer = self.nova_cooldown
            # Выпускаем кольцо плазменных снарядов
            for i in range(12):
                ang = i * (2 * math.pi / 12) + self.barrier_angle
                res_projectiles.append({
                    "x": self.x, "y": self.y,
                    "dx": math.cos(ang) * 5.5,
                    "dy": math.sin(ang) * 5.5,
                    "life": 75,
                    "is_boss": False,
                    "is_enemy_bolt": True,
                    "color": (217, 70, 239)
                })

        # Логика таранного рывка
        if self.is_dashing:
            self.dash_timer -= 1
            if self.dash_timer <= 0:
                self.is_dashing = False
            angle = math.atan2(player_y - self.y, player_x - self.x)
            self.x += math.cos(angle) * 4.5
            self.y += math.sin(angle) * 4.5
        else:
            self.dash_cooldown -= 1
            if self.dash_cooldown <= 0:
                self.dash_cooldown = 200
                self.is_dashing = True
                self.dash_timer = 40
            angle = math.atan2(player_y - self.y, player_x - self.x)
            self.x += math.cos(angle) * self.speed
            self.y += math.sin(angle) * self.speed

        self.x = max(60.0, min(WINDOW_WIDTH - 60.0, self.x))
        self.y = max(110.0, min(WINDOW_HEIGHT - 60.0, self.y))

        return res_projectiles

    def take_damage(self, amount, hit_x, hit_y, particles):
        # Проверяем, попал ли выстрел в щит-барьер
        hit_angle = math.atan2(hit_y - self.y, hit_x - self.x)
        diff = (hit_angle - self.barrier_angle + math.pi) % (2 * math.pi) - math.pi
        if abs(diff) < 0.9:
            # Отражение барьером!
            for _ in range(4):
                particles.append({
                    "x": hit_x, "y": hit_y,
                    "dx": random.uniform(-4, 4), "dy": random.uniform(-4, 4),
                    "life": 10, "color": (168, 85, 247)
                })
            return False

        self.hp -= amount
        for _ in range(3):
            particles.append({
                "x": self.x, "y": self.y,
                "dx": random.uniform(-4, 4), "dy": random.uniform(-4, 4),
                "life": 12, "color": self.color
            })
        return self.hp <= 0

    def draw(self, surface):
        sz = self.size
        # Вращающийся щит-барьер (дуга)
        barrier_rad = sz + 18
        bx1 = self.x + math.cos(self.barrier_angle - 0.7) * barrier_rad
        by1 = self.y + math.sin(self.barrier_angle - 0.7) * barrier_rad
        bx2 = self.x + math.cos(self.barrier_angle + 0.7) * barrier_rad
        by2 = self.y + math.sin(self.barrier_angle + 0.7) * barrier_rad
        pygame.draw.line(surface, (232, 121, 249), (bx1, by1), (bx2, by2), 5)
        pygame.draw.circle(surface, (255, 255, 255), (int(self.x + math.cos(self.barrier_angle) * barrier_rad), int(self.y + math.sin(self.barrier_angle) * barrier_rad)), 4)

        # Тело босса
        pygame.draw.rect(surface, self.color, pygame.Rect(self.x - sz - 4, self.y - sz - 4, (sz + 4) * 2, (sz + 4) * 2), width=3)
        pygame.draw.rect(surface, (60, 15, 75), pygame.Rect(self.x - sz, self.y - sz, sz * 2, sz * 2))
        pygame.draw.rect(surface, (245, 208, 254), pygame.Rect(self.x - sz, self.y - sz, sz * 2, sz * 2), width=2)

        # Ядро
        pygame.draw.circle(surface, (255, 255, 255), (int(self.x), int(self.y)), 10)
        pygame.draw.circle(surface, self.color, (int(self.x), int(self.y)), 6)
