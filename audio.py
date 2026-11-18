# audio.py - Звуковая система игры
import os
import pygame

class SoundManager:
    def __init__(self, filename="level_music.wav"):
        self.filename = filename
        self.is_playing = False
        self.available = False
        try:
            if not pygame.mixer.get_init():
                pygame.mixer.init(frequency=44100, size=-16, channels=2, buffer=512)
            self.available = True
        except Exception as e:
            print(f"[SoundManager] Звук недоступен: {e}")

    def play_level_music(self):
        if not self.available or self.is_playing:
            return
        if os.path.exists(self.filename):
            try:
                pygame.mixer.music.load(self.filename)
                pygame.mixer.music.set_volume(0.65)
                pygame.mixer.music.play(-1)
                self.is_playing = True
            except Exception as e:
                print(f"[SoundManager] Ошибка воспроизведения: {e}")

    def pause_music(self):
        if self.available and self.is_playing:
            pygame.mixer.music.pause()
            self.is_playing = False

    def resume_music(self):
        if self.available and not self.is_playing:
            pygame.mixer.music.unpause()
            self.is_playing = True

    def stop_music(self):
        if self.available and self.is_playing:
            pygame.mixer.music.stop()
            self.is_playing = False
