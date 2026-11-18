# game.py - Игровой процесс, арена со стенами, 3 уровня и боссы
import math
import random
import pygame
from config import WINDOW_WIDTH, WINDOW_HEIGHT, PLAYER_BASE_SPEED, PLAYER_RAM_MULTIPLIER, DAMAGE_COOLDOWN_TICKS, UI_BG_COLOR, STONE_WALL_COLOR
from entities import Player, Enemy
from boss import Boss, AegisOverlordBoss

class GameLevel:
    def __init__(self, level, on_return_menu, sound_manager, engine):
        self.level = level
        self.on_return_menu = on_return_menu
        self.sound_manager = sound_manager
        self.engine = engine

        self.font = pygame.font.SysFont("Consolas", 14, bold=True)
        self.font_big = pygame.font.SysFont("Consolas", 46, bold=True)
        self.font_msg = pygame.font.SysFont("Consolas", 18, bold=True)

        self.setup_level()
        if self.sound_manager:
            self.sound_manager.play_level_music()

    def setup_level(self):
        self.player = Player(WINDOW_WIDTH / 2, (WINDOW_HEIGHT + 50) / 2)
        self.enemies = []
        self.flying_lasers = []
        self.particles = []
        self.trails = []
        self.bosses = []
        self.level3_phase = 0  # 0: волны, 1: 2 титана, 2: призван Владыка Эгида

        self.lives = 3
        self.ram_stamina = 100.0
        self.space_pressed = False
        self.is_ramming = False
        self.ram_exhausted = False

        self.laser_stamina = 100.0
        self.right_clicked = False
        self.laser_exhausted = False
        self.active_laser = False
        self.laser_angle = 0.0

        if self.level == 1:
            self.max_enemies = 15
        elif self.level == 2:
            self.max_enemies = 40
        else:
            self.max_enemies = 55

        self.enemies_remaining = self.max_enemies
        self.spawn_counter = 0
        self.anim_tick = 0

        self.is_paused = False
        self.is_game_over = False
        self.is_victory = False
        self.is_tutorial_open = (self.level == 1)

        self.mouse_x = WINDOW_WIDTH / 2
        self.mouse_y = (WINDOW_HEIGHT + 50) / 2

        # Каменные плиты и осколки арены
        self.static_stones = []
        for _ in range(45):
            x = random.randint(35, WINDOW_WIDTH - 35)
            y = random.randint(85, WINDOW_HEIGHT - 35)
            sz = random.randint(4, 9)
            self.static_stones.append((x, y, sz))

        # Начальный спавн
        for _ in range(5):
            self.spawn_enemy()

    def spawn_enemy(self):
        if self.enemies_remaining <= 0: return

        # Босс 2 уровня
        if self.level == 2 and self.enemies_remaining == 1 and not self.bosses:
            self.bosses.append(Boss(WINDOW_WIDTH / 2, 130, name="TITAN ANNIHILATOR", hp=30.0))
            self.enemies_remaining -= 1
            return

        # Боссы 3 уровня (Фаза 1: 2 Титана)
        if self.level == 3 and self.enemies_remaining <= 2 and self.level3_phase == 0 and not self.bosses:
            self.level3_phase = 1
            self.bosses.append(Boss(WINDOW_WIDTH / 3, 130, name="RED TITAN ALPHA", hp=24.0, color=(239, 68, 68)))
            self.bosses.append(Boss((WINDOW_WIDTH * 2) / 3, 130, name="CRIMSON TITAN OMEGA", hp=24.0, color=(249, 115, 22)))
            self.enemies_remaining = 0
            return

        side = random.choice(["top", "bottom", "left", "right"])
        if side == "top": x, y = random.randint(40, WINDOW_WIDTH - 40), 90
        elif side == "bottom": x, y = random.randint(40, WINDOW_WIDTH - 40), WINDOW_HEIGHT - 40
        elif side == "left": x, y = 40, random.randint(90, WINDOW_HEIGHT - 40)
        else: x, y = WINDOW_WIDTH - 40, random.randint(90, WINDOW_HEIGHT - 40)

        is_elite = (self.level == 3 and random.random() < 0.35)
        self.enemies.append(Enemy(x, y, is_elite=is_elite))
        self.enemies_remaining -= 1

    def spawn_sparks(self, x, y, count=24, color=(255, 105, 180)):
        """Легковесный и сочный взрыв искрами без тяжелых лагов"""
        for _ in range(count):
            ang = random.uniform(0, 2 * math.pi)
            spd = random.uniform(2.5, 7.0)
            self.particles.append({
                "x": x, "y": y,
                "dx": math.cos(ang) * spd,
                "dy": math.sin(ang) * spd,
                "life": random.randint(12, 22),
                "color": color
            })

    def damage_player(self):
        if self.player.invulnerability_timer > 0:
            return  # Защита 2-секундного кулдауна урона

        self.lives -= 1
        self.player.invulnerability_timer = DAMAGE_COOLDOWN_TICKS
        self.engine.trigger_flash()
        self.engine.trigger_shake(1.4)

        # Искры урона
        self.spawn_sparks(self.player.x, self.player.y, count=18, color=(192, 132, 252))

        if self.lives <= 0:
            self.is_game_over = True

    def handle_event(self, event):
        if event.type == pygame.MOUSEMOTION:
            self.mouse_x, self.mouse_y = event.pos

        elif event.type == pygame.MOUSEBUTTONDOWN:
            if event.button == 1:  # ЛКМ
                x, y = event.pos
                if self.is_tutorial_open:
                    if WINDOW_WIDTH // 2 - 80 <= x <= WINDOW_WIDTH // 2 + 80 and 470 <= y <= 520:
                        self.is_tutorial_open = False
                    return

                if self.is_paused:
                    if WINDOW_WIDTH // 2 - 110 <= x <= WINDOW_WIDTH // 2 + 110 and WINDOW_HEIGHT // 2 + 10 <= y <= WINDOW_HEIGHT // 2 + 60:
                        if self.sound_manager: self.sound_manager.stop_music()
                        self.on_return_menu()
                    return

                if self.is_victory:
                    if WINDOW_WIDTH // 2 - 110 <= x <= WINDOW_WIDTH // 2 - 10 and WINDOW_HEIGHT // 2 + 20 <= y <= WINDOW_HEIGHT // 2 + 70:
                        self.setup_level()
                    elif WINDOW_WIDTH // 2 + 10 <= x <= WINDOW_WIDTH // 2 + 110 and WINDOW_HEIGHT // 2 + 20 <= y <= WINDOW_HEIGHT // 2 + 70:
                        if self.level < 3:
                            self.level += 1
                            self.setup_level()
                        else:
                            if self.sound_manager: self.sound_manager.stop_music()
                            self.on_return_menu()

                elif self.is_game_over:
                    if WINDOW_WIDTH // 2 - 60 <= x <= WINDOW_WIDTH // 2 + 60 and WINDOW_HEIGHT // 2 + 20 <= y <= WINDOW_HEIGHT // 2 + 70:
                        self.setup_level()

            elif event.button == 3:  # ПКМ (Зажать луч)
                if self.is_tutorial_open or self.is_paused or self.is_game_over or self.is_victory: return
                if self.mouse_y > 65 and self.laser_stamina > 0 and not self.laser_exhausted and not self.active_laser:
                    self.right_clicked = True
                    self.laser_angle = math.atan2(self.mouse_y - self.player.y, self.mouse_x - self.player.x)
                    self.active_laser = True

        elif event.type == pygame.MOUSEBUTTONUP:
            if event.button == 3 and self.right_clicked:  # ПКМ (Отпустить сгусток)
                self.right_clicked = False
                if self.active_laser:
                    dx = math.cos(self.laser_angle) * 22
                    dy = math.sin(self.laser_angle) * 22
                    self.flying_lasers.append({
                        "x": self.player.x, "y": self.player.y,
                        "dx": dx, "dy": dy, "life": 85, "is_boss": False
                    })
                    self.active_laser = False

        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_SPACE:
                self.space_pressed = True
            elif event.key == pygame.K_ESCAPE:
                if not (self.is_tutorial_open or self.is_game_over or self.is_victory):
                    self.is_paused = not self.is_paused
                    if self.sound_manager:
                        if self.is_paused: self.sound_manager.pause_music()
                        else: self.sound_manager.resume_music()

        elif event.type == pygame.KEYUP:
            if event.key == pygame.K_SPACE:
                self.space_pressed = False

    def update(self):
        if self.is_tutorial_open or self.is_paused or self.is_game_over or self.is_victory:
            return

        self.anim_tick += 1
        self.player.update()

        # Проверка фазы 3 уровня: спавн Владыки Эгиды при смерти одного из титанов
        if self.level == 3 and self.level3_phase == 1 and len(self.bosses) == 1:
            self.level3_phase = 2
            self.bosses.append(AegisOverlordBoss(WINDOW_WIDTH / 2, 140))
            self.engine.trigger_shake(1.5)

        # Периодический спавн
        if len(self.enemies) == 0 and not self.bosses and self.enemies_remaining > 0:
            for _ in range(min(5, self.enemies_remaining)):
                self.spawn_enemy()
            self.spawn_counter = 0

        self.spawn_counter += 1
        if self.spawn_counter >= 380 and self.enemies_remaining > 0:
            self.spawn_counter = 0
            for _ in range(min(4, self.enemies_remaining)): self.spawn_enemy()

        # Лазерная стамина
        if self.right_clicked:
            self.laser_stamina = max(0.0, self.laser_stamina - 2.2)
            if self.laser_stamina <= 5.0:
                self.laser_exhausted = True
                self.right_clicked = False
                self.active_laser = False
        else:
            regen = 0.8 if self.laser_exhausted else 1.6
            self.laser_stamina = min(100.0, self.laser_stamina + regen)
            if self.laser_stamina >= 100.0:
                self.laser_exhausted = False

        # Таранная стамина
        if self.space_pressed and self.ram_stamina > 0 and not self.ram_exhausted:
            self.is_ramming = True
            self.ram_stamina = max(0.0, self.ram_stamina - 4.2)
            if self.ram_stamina <= 5.0:
                self.ram_exhausted = True
        else:
            self.is_ramming = False
            regen = 0.6 if self.ram_exhausted else 1.2
            self.ram_stamina = min(100.0, self.ram_stamina + regen)
            if self.ram_stamina >= 100.0:
                self.ram_exhausted = False

        # Движение игрока
        dist_to_mouse = math.hypot(self.mouse_x - self.player.x, self.mouse_y - self.player.y)
        if dist_to_mouse > 6:
            angle = math.atan2(self.mouse_y - self.player.y, self.mouse_x - self.player.x)
            current_speed = min(PLAYER_BASE_SPEED * (PLAYER_RAM_MULTIPLIER if self.is_ramming else 1.0), dist_to_mouse * 0.08)
            self.player.x += math.cos(angle) * current_speed
            self.player.y += math.sin(angle) * current_speed

            if current_speed > 1.5:
                self.particles.append({
                    "x": self.player.x, "y": self.player.y,
                    "dx": random.uniform(-1.5, 1.5), "dy": random.uniform(-1.5, 1.5),
                    "life": 12, "color": (192, 132, 252)
                })

        # Границы стен арены
        self.player.x = max(self.player.size + 24, min(WINDOW_WIDTH - self.player.size - 24, self.player.x))
        self.player.y = max(65 + self.player.size + 20, min(WINDOW_HEIGHT - self.player.size - 24, self.player.y))

        self.engine.player_pos = (self.player.x, self.player.y)
        self.engine.is_ramming = 1.0 if self.is_ramming else 0.0

        # След игрока
        self.trails.append({"x": self.player.x, "y": self.player.y, "size": self.player.size, "life": 4})

        # Наведение активного лазера
        if self.right_clicked and self.active_laser:
            target_angle = math.atan2(self.mouse_y - self.player.y, self.mouse_x - self.player.x)
            diff = (target_angle - self.laser_angle + math.pi) % (2 * math.pi) - math.pi
            self.laser_angle += diff * 0.05

            length = 1500
            dirx, diry = math.cos(self.laser_angle), math.sin(self.laser_angle)

            # Урон по боссам от лазера
            for b in self.bosses[:]:
                bx, by = b.x, b.y
                proj = (bx - self.player.x) * dirx + (by - self.player.y) * diry
                if 0 <= proj <= length:
                    cx, cy = self.player.x + dirx * proj, self.player.y + diry * proj
                    if math.hypot(bx - cx, by - cy) < (b.size + 8):
                        if isinstance(b, AegisOverlordBoss):
                            is_dead = b.take_damage(0.35, cx, cy, self.particles)
                        else:
                            is_dead = b.take_damage(0.4, self.particles)
                        if is_dead:
                            self.spawn_sparks(b.x, b.y, count=36, color=b.color)
                            self.engine.trigger_shake(1.2)
                            self.bosses.remove(b)

            # Урон по врагам от лазера
            for enemy in self.enemies[:]:
                proj = (enemy.x - self.player.x) * dirx + (enemy.y - self.player.y) * diry
                if 0 <= proj <= length:
                    cx, cy = self.player.x + dirx * proj, self.player.y + diry * proj
                    if math.hypot(enemy.x - cx, enemy.y - cy) < 16:
                        self.enemies.remove(enemy)
                        self.spawn_sparks(enemy.x, enemy.y, count=24, color=(239, 68, 68))
                        self.engine.trigger_shake(0.35)

        # Обновление боссов
        for b in self.bosses[:]:
            if isinstance(b, AegisOverlordBoss):
                bolts = b.update(self.player.x, self.player.y, self.particles)
                for bolt in bolts:
                    self.flying_lasers.append(bolt)
            else:
                new_laser = b.update(self.player.x, self.player.y, self.particles)
                if new_laser:
                    self.flying_lasers.append(new_laser)
                    self.engine.trigger_shake(0.8)

            # Столкновение с игроком
            if math.hypot(self.player.x - b.x, self.player.y - b.y) < (self.player.size + b.size):
                self.damage_player()

        # Обновление летящих снарядов
        for fl in self.flying_lasers[:]:
            fl["life"] -= 1
            if fl["life"] <= 0:
                self.flying_lasers.remove(fl)
                continue

            # Если игрок в таране, он отражает вражеские выстрелы!
            if self.is_ramming and math.hypot(self.player.x - fl["x"], self.player.y - fl["y"]) < (self.player.size + 24):
                self.spawn_sparks(fl["x"], fl["y"], count=8, color=(255, 105, 180))
                self.flying_lasers.remove(fl)
                continue

            if fl.get("is_boss"):
                # Луч босса
                angle = fl["angle"]
                dirx, diry = math.cos(angle), math.sin(angle)
                proj = (self.player.x - fl["x"]) * dirx + (self.player.y - fl["y"]) * diry
                if 0 <= proj <= 1500:
                    cx, cy = fl["x"] + dirx * proj, fl["y"] + diry * proj
                    if math.hypot(self.player.x - cx, self.player.y - cy) < (self.player.size + 10):
                        self.damage_player()
                        break
            else:
                fl["x"] += fl["dx"]
                fl["y"] += fl["dy"]
                if math.hypot(self.player.x - fl["x"], self.player.y - fl["y"]) < (self.player.size + 8):
                    self.damage_player()
                    self.flying_lasers.remove(fl)

        # Обновление врагов
        for enemy in self.enemies[:]:
            bullet = enemy.update(self.player.x, self.player.y, self.spawn_counter)
            if bullet:
                self.flying_lasers.append(bullet)

            # Таран игрока уничтожает врага
            if self.is_ramming and math.hypot(self.player.x - enemy.x, self.player.y - enemy.y) < (self.player.size + 24):
                self.enemies.remove(enemy)
                self.spawn_sparks(enemy.x, enemy.y, count=24, color=(255, 0, 127))
                self.engine.trigger_shake(0.35)
                continue

            # Удар по игроку
            if math.hypot(self.player.x - enemy.x, self.player.y - enemy.y) < (self.player.size + 10):
                self.enemies.remove(enemy)
                self.damage_player()
                break

        # Затухание следов и частиц
        for t in self.trails[:]:
            t["life"] -= 1
            if t["life"] <= 0: self.trails.remove(t)

        for p in self.particles[:]:
            p["x"] += p["dx"]
            p["y"] += p["dy"]
            p["dx"] *= 0.94
            p["dy"] *= 0.94
            p["life"] -= 1
            if p["life"] <= 0: self.particles.remove(p)

        # Победа
        if not self.enemies and self.enemies_remaining <= 0 and not self.bosses:
            self.is_victory = True

    def draw(self, surface):
        surface.fill((0, 0, 0, 0))

        # Каменная арена
        for x, y, sz in self.static_stones:
            pts = [(x, y - sz), (x + sz * 0.8, y + sz), (x - sz * 0.8, y + sz * 0.6)]
            pygame.draw.polygon(surface, (24, 24, 36), pts)

        # Четкие стены арены
        pygame.draw.rect(surface, STONE_WALL_COLOR, pygame.Rect(0, 50, WINDOW_WIDTH, 16))
        pygame.draw.rect(surface, STONE_WALL_COLOR, pygame.Rect(0, WINDOW_HEIGHT - 16, WINDOW_WIDTH, 16))
        pygame.draw.rect(surface, STONE_WALL_COLOR, pygame.Rect(0, 50, 16, WINDOW_HEIGHT - 50))
        pygame.draw.rect(surface, STONE_WALL_COLOR, pygame.Rect(WINDOW_WIDTH - 16, 50, 16, WINDOW_HEIGHT - 50))

        # Следы
        for t in self.trails:
            ps = t["size"]
            pts = [(t["x"], t["y"] - ps), (t["x"] + ps, t["y"]), (t["x"], t["y"] + ps), (t["x"] - ps, t["y"])]
            pygame.draw.polygon(surface, (88, 28, 135), pts, width=1)

        # Аура щита тарана
        if self.is_ramming:
            aura_col = (255, 0, 127) if (self.anim_tick // 3) % 2 == 0 else (255, 105, 180)
            pygame.draw.circle(surface, aura_col, (int(self.player.x), int(self.player.y)), 30, width=3)

        # Игрок
        self.player.draw(surface, self.anim_tick)

        # Активный плазменный луч игрока
        if self.right_clicked and self.active_laser:
            length = 1500
            lx2 = self.player.x + math.cos(self.laser_angle) * length
            ly2 = self.player.y + math.sin(self.laser_angle) * length
            pygame.draw.line(surface, (232, 121, 249), (self.player.x, self.player.y), (lx2, ly2), 18)
            pygame.draw.line(surface, (192, 132, 252), (self.player.x, self.player.y), (lx2, ly2), 10)
            pygame.draw.line(surface, (255, 255, 255), (self.player.x, self.player.y), (lx2, ly2), 4)

        # Летящие лазеры и снаряды
        for fl in self.flying_lasers:
            if fl.get("is_boss"):
                length = 1500
                angle = fl["angle"]
                lx2 = fl["x"] + math.cos(angle) * length
                ly2 = fl["y"] + math.sin(angle) * length
                col = fl.get("color", (239, 68, 68))
                pygame.draw.line(surface, col, (fl["x"], fl["y"]), (lx2, ly2), 20)
                pygame.draw.line(surface, (255, 255, 255), (fl["x"], fl["y"]), (lx2, ly2), 5)
            elif fl.get("is_enemy_bolt"):
                pygame.draw.circle(surface, fl.get("color", (239, 68, 68)), (int(fl["x"]), int(fl["y"])), 6)
                pygame.draw.circle(surface, (255, 255, 255), (int(fl["x"]), int(fl["y"])), 3)
            else:
                length = 1500
                angle = math.atan2(fl["dy"], fl["dx"])
                lx2 = fl["x"] + math.cos(angle) * length
                ly2 = fl["y"] + math.sin(angle) * length
                pygame.draw.line(surface, (232, 121, 249), (fl["x"], fl["y"]), (lx2, ly2), 16)
                pygame.draw.line(surface, (255, 255, 255), (fl["x"], fl["y"]), (lx2, ly2), 4)

        # Боссы
        for b in self.bosses:
            b.draw(surface)

        # Враги
        for enemy in self.enemies:
            enemy.draw(surface, self.anim_tick)

        # Искры
        for p in self.particles:
            pygame.draw.line(surface, p["color"], (p["x"], p["y"]), (p["x"] - p["dx"] * 1.5, p["y"] - p["dy"] * 1.5), 2)

        # Прицел курсора
        pygame.draw.line(surface, (168, 85, 247), (self.player.x, self.player.y), (self.mouse_x, self.mouse_y), 1)
        pygame.draw.circle(surface, (232, 121, 249), (int(self.mouse_x), int(self.mouse_y)), 7, width=2)

        # Верхняя панель HUD
        pygame.draw.rect(surface, UI_BG_COLOR, pygame.Rect(0, 0, WINDOW_WIDTH, 50))
        pygame.draw.line(surface, (42, 42, 56), (0, 50), (WINDOW_WIDTH, 50), 2)

        txt_lvl = self.font.render(f"LEVEL: {self.level}", True, (243, 232, 255))
        surface.blit(txt_lvl, (20, 16))

        # Жизни
        txt_lives = self.font.render(f"LIVES: {self.lives}", True, (244, 63, 94))
        surface.blit(txt_lives, (120, 16))

        # Щит тарана
        txt_shld = self.font.render("SHIELD", True, (255, 105, 180))
        surface.blit(txt_shld, (220, 16))
        pygame.draw.rect(surface, (28, 28, 40), pygame.Rect(275, 18, 100, 14))
        pygame.draw.rect(surface, (58, 58, 79), pygame.Rect(275, 18, 100, 14), width=1)
        pygame.draw.rect(surface, (255, 0, 127), pygame.Rect(276, 19, int(98 * (self.ram_stamina / 100.0)), 12))

        # Лазер
        txt_lsr = self.font.render("LASER", True, (168, 85, 247))
        surface.blit(txt_lsr, (390, 16))
        pygame.draw.rect(surface, (28, 28, 40), pygame.Rect(440, 18, 100, 14))
        pygame.draw.rect(surface, (58, 58, 79), pygame.Rect(440, 18, 100, 14), width=1)
        pygame.draw.rect(surface, (168, 85, 247), pygame.Rect(441, 19, int(98 * (self.laser_stamina / 100.0)), 12))

        # Полосы боссов
        for idx, b in enumerate(self.bosses):
            hp_pct = max(0.0, b.hp) / b.max_hp
            bx = WINDOW_WIDTH - 280
            by = 12 + idx * 16
            pygame.draw.rect(surface, (20, 20, 30), pygame.Rect(bx, by, 160, 10))
            pygame.draw.rect(surface, b.color, pygame.Rect(bx, by, int(160 * hp_pct), 10))
            pygame.draw.rect(surface, (60, 60, 80), pygame.Rect(bx, by, 160, 10), width=1)

        # Оверлеи
        if self.is_paused:
            overlay = pygame.Surface((WINDOW_WIDTH, WINDOW_HEIGHT), pygame.SRCALPHA)
            overlay.fill((5, 5, 8, 190))
            surface.blit(overlay, (0, 0))
            txt = self.font_big.render("PAUSED", True, (243, 232, 255))
            surface.blit(txt, (WINDOW_WIDTH // 2 - txt.get_width() // 2, WINDOW_HEIGHT // 2 - 70))
            btn = pygame.Rect(WINDOW_WIDTH // 2 - 100, WINDOW_HEIGHT // 2 + 15, 200, 48)
            pygame.draw.rect(surface, (30, 27, 75), btn, border_radius=6)
            pygame.draw.rect(surface, (232, 121, 249), btn, width=2, border_radius=6)
            txt_m = self.font_msg.render("MENU", True, (243, 232, 255))
            surface.blit(txt_m, (WINDOW_WIDTH // 2 - txt_m.get_width() // 2, WINDOW_HEIGHT // 2 + 28))

        elif self.is_victory:
            txt_v = self.font_big.render("VICTORY!", True, (74, 222, 128))
            surface.blit(txt_v, (WINDOW_WIDTH // 2 - txt_v.get_width() // 2, WINDOW_HEIGHT // 2 - 80))
            btn_r = pygame.Rect(WINDOW_WIDTH // 2 - 110, WINDOW_HEIGHT // 2 + 20, 100, 48)
            pygame.draw.rect(surface, (30, 27, 75), btn_r, border_radius=6)
            pygame.draw.rect(surface, (192, 132, 252), btn_r, width=2, border_radius=6)
            txt_r = self.font_msg.render("RETRY", True, (243, 232, 255))
            surface.blit(txt_r, (btn_r.centerx - txt_r.get_width() // 2, btn_r.centery - txt_r.get_height() // 2))
            btn_n = pygame.Rect(WINDOW_WIDTH // 2 + 10, WINDOW_HEIGHT // 2 + 20, 100, 48)
            pygame.draw.rect(surface, (30, 27, 75), btn_n, border_radius=6)
            pygame.draw.rect(surface, (192, 132, 252), btn_n, width=2, border_radius=6)
            nxt_str = "NEXT" if self.level < 3 else "MENU"
            txt_n = self.font_msg.render(nxt_str, True, (243, 232, 255))
            surface.blit(txt_n, (btn_n.centerx - txt_n.get_width() // 2, btn_n.centery - txt_n.get_height() // 2))

        elif self.is_game_over:
            txt_g = self.font_big.render("GAME OVER", True, (239, 68, 68))
            surface.blit(txt_g, (WINDOW_WIDTH // 2 - txt_g.get_width() // 2, WINDOW_HEIGHT // 2 - 80))
            btn_r = pygame.Rect(WINDOW_WIDTH // 2 - 60, WINDOW_HEIGHT // 2 + 20, 120, 48)
            pygame.draw.rect(surface, (30, 27, 75), btn_r, border_radius=6)
            pygame.draw.rect(surface, (192, 132, 252), btn_r, width=2, border_radius=6)
            txt_r = self.font_msg.render("RESTART", True, (243, 232, 255))
            surface.blit(txt_r, (btn_r.centerx - txt_r.get_width() // 2, btn_r.centery - txt_r.get_height() // 2))

        elif self.is_tutorial_open:
            overlay = pygame.Surface((WINDOW_WIDTH, WINDOW_HEIGHT), pygame.SRCALPHA)
            overlay.fill((5, 5, 8, 205))
            surface.blit(overlay, (0, 0))
            box = pygame.Rect(WINDOW_WIDTH // 2 - 270, 150, 540, 400)
            pygame.draw.rect(surface, (15, 15, 26), box, border_radius=8)
            pygame.draw.rect(surface, (192, 132, 252), box, width=2, border_radius=8)
            title = self.font_msg.render("FLIGHT MANUAL", True, (243, 232, 255))
            surface.blit(title, (WINDOW_WIDTH // 2 - title.get_width() // 2, 185))
            lines = [
                ("• КУРСОР: Направление тяги и скорость полета.", (216, 180, 254)),
                ("• ПРАВЫЙ КЛИК: Зажать луч / отпустить сгусток.", (216, 180, 254)),
                ("• ПРОБЕЛ: Таранный щит (отражает лазеры и врагов).", (255, 105, 180))
            ]
            for idx, (lt, lc) in enumerate(lines):
                ts = self.font.render(lt, True, lc)
                surface.blit(ts, (WINDOW_WIDTH // 2 - 230, 240 + idx * 45))
            btn = pygame.Rect(WINDOW_WIDTH // 2 - 80, 460, 160, 46)
            pygame.draw.rect(surface, (30, 27, 75), btn, border_radius=6)
            pygame.draw.rect(surface, (232, 121, 249), btn, width=2, border_radius=6)
            txt_b = self.font_msg.render("ПОНЯЛ", True, (243, 232, 255))
            surface.blit(txt_b, (WINDOW_WIDTH // 2 - txt_b.get_width() // 2, 473))
