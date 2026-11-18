# engine.py - Аппаратный шейдерный движок рендеринга (ModernGL / Pygame Fallback)
import math
import random
import pygame

HAS_MODERNGL = False
try:
    import moderngl
    import numpy as np
    HAS_MODERNGL = True
except Exception:
    HAS_MODERNGL = False

VERTEX_SHADER = """
#version 330 core
in vec2 in_vert;
in vec2 in_uv;
out vec2 v_uv;
void main() {
    v_uv = in_uv;
    gl_Position = vec4(in_vert, 0.0, 1.0);
}
"""

FRAGMENT_SHADER = """
#version 330 core
uniform sampler2D u_game_texture;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_player_pos;
uniform float u_ramming;
uniform float u_flash;
uniform float u_shake;

in vec2 v_uv;
out vec4 fragColor;

void main() {
    vec2 uv = v_uv;

    // Смещение при дрожании экрана
    if (u_shake > 0.0) {
        uv.x += sin(u_time * 45.0) * 0.004 * u_shake;
        uv.y += cos(u_time * 50.0) * 0.004 * u_shake;
    }

    vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

    // Глубинные переливы плазмы в Бездне
    float wave = sin(p.x * 7.0 + u_time * 1.8) * cos(p.y * 7.0 - u_time * 1.5) * 0.06;
    float distToPlayer = length((gl_FragCoord.xy - u_player_pos) / u_resolution.y);

    // Фоновая темная Бездна с фиолетовым свечением
    vec3 deepBg = vec3(0.015, 0.015, 0.025);
    vec3 purpleGlow = vec3(0.14, 0.05, 0.24) * (0.6 + 0.4 * sin(u_time * 1.2 + wave));
    vec3 col = deepBg + purpleGlow * max(0.0, 1.0 - distToPlayer * 1.8);

    // Свечение от щита тарана
    if (u_ramming > 0.0) {
        float ramGlow = smoothstep(0.22, 0.0, distToPlayer);
        col += vec3(0.9, 0.08, 0.45) * ramGlow * u_ramming * (0.85 + 0.15 * sin(u_time * 24.0));
    }

    // Текстура игры, нарисованная Pygame
    vec4 gameCol = texture(u_game_texture, vec2(uv.x, 1.0 - uv.y));
    col = mix(col, gameCol.rgb, gameCol.a);

    // Вспышка урона по экрану
    if (u_flash > 0.0) {
        col += vec3(0.65, 0.05, 0.08) * u_flash;
    }

    fragColor = vec4(col, 1.0);
}
"""

class RenderEngine:
    def __init__(self, width, height, use_moderngl=True):
        self.width = width
        self.height = height
        self.use_moderngl = use_moderngl and HAS_MODERNGL

        self.game_surface = pygame.Surface((width, height), pygame.SRCALPHA)
        self.time = 0.0
        self.flash_timer = 0.0
        self.screen_shake = 0.0
        self.player_pos = (width / 2, height / 2)
        self.is_ramming = 0.0

        if self.use_moderngl:
            try:
                self.ctx = moderngl.create_context()
                self.prog = self.ctx.program(
                    vertex_shader=VERTEX_SHADER,
                    fragment_shader=FRAGMENT_SHADER
                )
                vertices = np.array([
                    -1.0, -1.0, 0.0, 0.0,
                     1.0, -1.0, 1.0, 0.0,
                    -1.0,  1.0, 0.0, 1.0,
                     1.0,  1.0, 1.0, 1.0,
                ], dtype='f4')
                self.vbo = self.ctx.buffer(vertices.tobytes())
                self.vao = self.ctx.simple_vertex_array(self.prog, self.vbo, 'in_vert', 'in_uv')

                self.texture = self.ctx.texture((width, height), 4)
                self.texture.filter = (moderngl.LINEAR, moderngl.LINEAR)
                self.texture.swizzle = 'RGBA'

                if 'u_resolution' in self.prog:
                    self.prog['u_resolution'].value = (width, height)
                if 'u_game_texture' in self.prog:
                    self.prog['u_game_texture'].value = 0
            except Exception as e:
                print(f"[RenderEngine] Ошибка инициализации ModernGL ({e}). Включаем софтверный режим Pygame.")
                self.use_moderngl = False

    def trigger_flash(self):
        self.flash_timer = 1.0

    def trigger_shake(self, amount=1.0):
        self.screen_shake = max(self.screen_shake, amount)

    def update(self, dt):
        self.time += dt
        if self.flash_timer > 0.0:
            self.flash_timer = max(0.0, self.flash_timer - dt * 4.5)
        if self.screen_shake > 0.0:
            self.screen_shake = max(0.0, self.screen_shake - dt * 3.5)

    def render(self, display_surface):
        if self.use_moderngl:
            raw_data = pygame.image.tostring(self.game_surface, 'RGBA', False)
            self.texture.write(raw_data)
            self.texture.use(0)

            if 'u_time' in self.prog:
                self.prog['u_time'].value = self.time
            if 'u_player_pos' in self.prog:
                self.prog['u_player_pos'].value = self.player_pos
            if 'u_ramming' in self.prog:
                self.prog['u_ramming'].value = self.is_ramming
            if 'u_flash' in self.prog:
                self.prog['u_flash'].value = self.flash_timer
            if 'u_shake' in self.prog:
                self.prog['u_shake'].value = self.screen_shake

            self.ctx.clear(0.0, 0.0, 0.0)
            self.vao.render(moderngl.TRIANGLE_STRIP)
            pygame.display.flip()
        else:
            # Fallback для стандартного Pygame
            display_surface.blit(self.game_surface, (0, 0))
            if self.flash_timer > 0.0:
                flash_surf = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
                flash_surf.fill((239, 68, 68, int(110 * self.flash_timer)))
                display_surface.blit(flash_surf, (0, 0))
            pygame.display.flip()
