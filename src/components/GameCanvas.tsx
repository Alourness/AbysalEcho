import React, { useEffect, useRef, useState, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { Volume2, VolumeX, Shield, Zap, Heart, RotateCcw, ArrowLeft } from 'lucide-react';

interface GameCanvasProps {
  initialLevel?: number;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ initialLevel = 1 }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement>(null);
  const gameCanvasRef = useRef<HTMLCanvasElement>(null);

  // Игровые состояния
  const [gameState, setGameState] = useState<'MENU' | 'PLAYING' | 'PAUSED' | 'VICTORY' | 'GAMEOVER'>('MENU');
  const [currentLevel, setCurrentLevel] = useState(initialLevel);
  const [lives, setLives] = useState(3);
  const [ramStamina, setRamStamina] = useState(100);
  const [laserStamina, setLaserStamina] = useState(100);
  const [enemiesLeft, setEnemiesLeft] = useState(15);
  const [bossesList, setBossesList] = useState<Array<{ name: string; hp: number; maxHp: number; color: string }>>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [showTutorial, setShowTutorial] = useState(false);

  // Звуковая система
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Игровые структуры данных (60 FPS)
  const gameData = useRef({
    width: 900,
    height: 650,
    player: { x: 450, y: 325, size: 16, vx: 0, vy: 0 },
    mouse: { x: 450, y: 325 },
    rightClicked: false,
    spacePressed: false,
    isRamming: false,
    ramExhausted: false,
    laserExhausted: false,
    activeLaser: false,
    laserAngle: 0,
    invulnerabilityTimer: 0, // 2-секундный кулдаун урона (120 тиков)
    flyingLasers: [] as Array<{
      x: number; y: number; dx: number; dy: number; life: number;
      isBoss?: boolean; angle?: number; isEnemyBolt?: boolean; color?: string;
    }>,
    enemies: [] as Array<{
      x: number; y: number; vx: number; vy: number;
      baseSpeed: number; speed: number;
      offset: number; timer: number;
      mode: 'flank' | 'rush' | 'retreat' | 'circle';
      isEliteQuad?: boolean;
      shootTimer?: number;
      ramChargeTimer?: number;
      ramDashTimer?: number;
      isRamming?: boolean;
    }>,
    bosses: [] as Array<{
      id: string;
      name: string;
      x: number; y: number; hp: number; maxHp: number; size: number;
      speed: number; attackCooldown: number; attackTimer: number;
      isWarning: boolean; warningTicks: number; currentAimAngle: number;
      color: string;
      isBarrierBoss?: boolean;
      barrierAngle?: number;
      dashCooldown?: number;
      isDashing?: boolean;
      radialNovaCooldown?: number;
    }>,
    level3Phase: 0, // 0: волны, 1: 2 титана, 2: призван Aegis Overlord
    // Искры, пламя и частицы
    particles: [] as Array<{
      x: number; y: number; dx: number; dy: number; life: number; maxLife: number;
      color: string; size: number;
      isSpark?: boolean; isFlame?: boolean; isCloud?: boolean;
    }>,
    // Остаточные светящиеся плазменные следы на полу
    plasmaEmbers: [] as Array<{
      x: number; y: number; life: number; maxLife: number; color: string; size: number;
    }>,
    // Вспышки шейдерного света от взрывов
    explosionLights: [] as Array<{
      x: number; y: number; life: number; maxLife: number; radius: number; color: [number, number, number];
    }>,
    // Фиолетовые молнии по земле при уроне игрока
    groundLightnings: [] as Array<{
      points: Array<[number, number]>;
      life: number;
      maxLife: number;
      color: string;
    }>,
    // Осколки и камни арены
    debris: [] as Array<{ x: number; y: number; sz: number; pts: number[][] }>,
    stoneTiles: [] as Array<{ x: number; y: number; shade: string; crack?: number[][] }>,
    animTick: 0,
    spawnCounter: 0,
    enemiesRemaining: 15,
    maxEnemies: 15,
    lives: 3,
    ramStamina: 100,
    laserStamina: 100,
    damageFlash: 0,
    screenShake: 0,
    level: 1,
    muzzleFlashTime: 0,
    // Большие плазменные пятна на фоне меню
    menuNebulaPatches: [] as Array<{
      x: number; y: number; vx: number; vy: number; radius: number; color: string;
    }>,
    // Лазеры боссов на фоне меню
    menuBossLasers: [] as Array<{
      x: number; y: number; angle: number; life: number; maxLife: number; color: string;
    }>,
  });

  // WebGL шейдер объемного освещения
  const glRef = useRef<{
    gl: WebGLRenderingContext;
    program: WebGLProgram;
    timeLoc: WebGLUniformLocation | null;
    resLoc: WebGLUniformLocation | null;
    playerLoc: WebGLUniformLocation | null;
    laserActiveLoc: WebGLUniformLocation | null;
    laserOriginLoc: WebGLUniformLocation | null;
    laserDirLoc: WebGLUniformLocation | null;
    bossLaserActiveLoc: WebGLUniformLocation | null;
    bossLaserOriginLoc: WebGLUniformLocation | null;
    bossLaserDirLoc: WebGLUniformLocation | null;
    ramLoc: WebGLUniformLocation | null;
    flashLoc: WebGLUniformLocation | null;
    expCountLoc: WebGLUniformLocation | null;
    expPosLoc: WebGLUniformLocation | null;
    expIntensityLoc: WebGLUniformLocation | null;
    expColorLoc: WebGLUniformLocation | null;
  } | null>(null);

  // Звуки SFX
  const playSfx = useCallback((type: 'laser' | 'hit' | 'ram' | 'boss_laser' | 'victory' | 'gameover' | 'explode' | 'lightning' | 'deflect') => {
    if (isMuted) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const effVol = volume;

      if (type === 'laser') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(620, now);
        osc.frequency.exponentialRampToValueAtTime(160, now + 0.16);
        gain.gain.setValueAtTime(0.25 * effVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.start(now);
        osc.stop(now + 0.16);
      } else if (type === 'hit') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.18);
        gain.gain.setValueAtTime(0.45 * effVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
      } else if (type === 'deflect') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(750, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.08);
        gain.gain.setValueAtTime(0.3 * effVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'lightning') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(420, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.25);
        gain.gain.setValueAtTime(0.45 * effVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'explode') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(25, now + 0.28);
        gain.gain.setValueAtTime(0.4 * effVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.28);
      } else if (type === 'ram') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.2);
        gain.gain.setValueAtTime(0.4 * effVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'boss_laser') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.linearRampToValueAtTime(480, now + 0.35);
        gain.gain.setValueAtTime(0.45 * effVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      } else if (type === 'victory') {
        [440, 554, 659, 880].forEach((freq, idx) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.frequency.value = freq;
          g.gain.setValueAtTime(0.2 * effVol, now + idx * 0.09);
          g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.35);
          o.start(now + idx * 0.09);
          o.stop(now + idx * 0.09 + 0.35);
        });
      } else if (type === 'gameover') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.6);
        gain.gain.setValueAtTime(0.4 * effVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
      }
    } catch {
      // Игнорируем
    }
  }, [isMuted, volume]);

  // Загрузка музыки
  useEffect(() => {
    const audio = new Audio('/assets/aistudio/level_music.wav');
    audio.loop = true;
    audio.volume = volume;
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Генерация плит, осколков и градиентных пятен меню
  useEffect(() => {
    const gd = gameData.current;
    gd.stoneTiles = [];
    const shades = ['#08080c', '#09090f', '#0b0b13', '#0a0a10', '#07070b'];

    for (let x = 0; x < gd.width; x += 50) {
      for (let y = 0; y < gd.height; y += 50) {
        const shade = shades[Math.floor(Math.random() * shades.length)];
        let crack: number[][] | undefined = undefined;
        if (Math.random() < 0.25) {
          const cx = x + Math.random() * 30 + 10;
          const cy = y + Math.random() * 30 + 10;
          crack = [
            [cx, cy],
            [cx + (Math.random() - 0.5) * 16, cy + (Math.random() - 0.5) * 16],
            [cx + (Math.random() - 0.5) * 26, cy + (Math.random() - 0.5) * 26],
          ];
        }
        gd.stoneTiles.push({ x, y, shade, crack });
      }
    }

    gd.debris = [];
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * (gd.width - 120) + 60;
      const y = Math.random() * (gd.height - 120) + 60;
      const sz = Math.random() * 6 + 3.5;
      gd.debris.push({
        x,
        y,
        sz,
        pts: [
          [x, y - sz],
          [x + sz * 0.85, y + sz * 0.9],
          [x - sz * 0.85, y + sz * 0.6],
        ],
      });
    }

    // Большие градиентные туманные пятна на фоне главного меню
    gd.menuNebulaPatches = [
      { x: 180, y: 160, vx: 0.25, vy: 0.18, radius: 260, color: 'rgba(69, 10, 10, 0.45)' },
      { x: 720, y: 220, vx: -0.2, vy: 0.22, radius: 280, color: 'rgba(59, 7, 100, 0.4)' },
      { x: 450, y: 520, vx: 0.18, vy: -0.24, radius: 310, color: 'rgba(112, 26, 117, 0.35)' },
      { x: 250, y: 580, vx: -0.22, vy: -0.15, radius: 240, color: 'rgba(15, 23, 42, 0.5)' },
    ];
  }, []);

  // WebGL шейдер освещения с контрастом и источниками света от взрывов
  useEffect(() => {
    const canvas = webglCanvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl');
    if (!gl) return;

    const vsSource = `
      attribute vec2 a_pos;
      varying vec2 v_uv;
      void main() {
        v_uv = (a_pos + 1.0) * 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;

    const fsSource = `
      precision mediump float;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform vec2 u_player;
      uniform float u_ramming;
      uniform float u_flash;

      uniform float u_laser_active;
      uniform vec2 u_laser_origin;
      uniform vec2 u_laser_dir;

      uniform float u_boss_laser_active;
      uniform vec2 u_boss_laser_origin;
      uniform vec2 u_boss_laser_dir;

      // Источники света от взрывов
      uniform int u_exp_count;
      uniform vec2 u_exp_pos[8];
      uniform float u_exp_intensity[8];
      uniform vec3 u_exp_color[8];

      varying vec2 v_uv;

      float distToRay(vec2 p, vec2 o, vec2 d) {
        vec2 v = p - o;
        float proj = dot(v, d);
        if (proj < 0.0) return length(v);
        vec2 closest = o + d * proj;
        return length(p - closest);
      }

      void main() {
        vec2 pixel = gl_FragCoord.xy;

        // Контрастный глубокий темный тон
        vec3 col = vec3(0.028, 0.028, 0.038);

        // 1. Свет вокруг игрока
        float distToPlayer = length(pixel - u_player);
        float playerLight = smoothstep(230.0, 0.0, distToPlayer);
        col += vec3(0.22, 0.09, 0.35) * playerLight;

        // 2. Мягкое боковое освещение от лазера игрока
        if (u_laser_active > 0.0) {
          float dLaser = distToRay(pixel, u_laser_origin, u_laser_dir);
          float lateralGlow = smoothstep(120.0, 0.0, dLaser);
          float pulse = 0.85 + 0.15 * sin(u_time * 24.0 - dLaser * 0.04);
          col += vec3(0.48, 0.16, 0.70) * lateralGlow * pulse * 1.6;
          float baseGlow = smoothstep(90.0, 0.0, length(pixel - u_laser_origin));
          col += vec3(0.65, 0.22, 0.85) * baseGlow;
        }

        // 3. Боковое освещение от лазера босса
        if (u_boss_laser_active > 0.0) {
          float dBossLaser = distToRay(pixel, u_boss_laser_origin, u_boss_laser_dir);
          float bossLateralGlow = smoothstep(150.0, 0.0, dBossLaser);
          float pulse = 0.85 + 0.15 * sin(u_time * 28.0);
          col += vec3(0.85, 0.10, 0.10) * bossLateralGlow * pulse * 2.0;
          float bossMuzzleGlow = smoothstep(130.0, 0.0, length(pixel - u_boss_laser_origin));
          col += vec3(1.0, 0.2, 0.1) * bossMuzzleGlow;
        }

        // 4. Освещение от таранного щита
        if (u_ramming > 0.0) {
          float ramLight = smoothstep(170.0, 0.0, distToPlayer);
          float ring = sin(distToPlayer * 0.16 - u_time * 18.0) * 0.5 + 0.5;
          col += vec3(0.75, 0.05, 0.38) * ramLight * (0.7 + 0.3 * ring) * 1.5;
        }

        // 5. Источники шейдерного света от плазматических взрывов
        for (int i = 0; i < 8; i++) {
          if (i >= u_exp_count) break;
          float dExp = length(pixel - u_exp_pos[i]);
          float expLight = smoothstep(280.0, 0.0, dExp) * u_exp_intensity[i];
          float hotCore = smoothstep(75.0, 0.0, dExp) * u_exp_intensity[i] * 1.6;
          col += u_exp_color[i] * (expLight + hotCore);
        }

        // 6. Угловые плазменные жаровни бастионов
        float bFlicker = 0.85 + 0.15 * sin(u_time * 8.0);
        float bTL = smoothstep(130.0, 0.0, length(pixel - vec2(36.0, 650.0 - 36.0))) * bFlicker;
        float bTR = smoothstep(130.0, 0.0, length(pixel - vec2(864.0, 650.0 - 36.0))) * bFlicker;
        float bBL = smoothstep(130.0, 0.0, length(pixel - vec2(36.0, 36.0))) * bFlicker;
        float bBR = smoothstep(130.0, 0.0, length(pixel - vec2(864.0, 36.0))) * bFlicker;
        col += vec3(0.36, 0.08, 0.52) * (bTL + bTR + bBL + bBR);

        // 7. Вспышка урона
        if (u_flash > 0.0) {
          col += vec3(0.7, 0.05, 0.05) * u_flash;
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    const createShader = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return null;
      return s;
    };

    const vs = createShader(gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    glRef.current = {
      gl,
      program,
      timeLoc: gl.getUniformLocation(program, 'u_time'),
      resLoc: gl.getUniformLocation(program, 'u_resolution'),
      playerLoc: gl.getUniformLocation(program, 'u_player'),
      laserActiveLoc: gl.getUniformLocation(program, 'u_laser_active'),
      laserOriginLoc: gl.getUniformLocation(program, 'u_laser_origin'),
      laserDirLoc: gl.getUniformLocation(program, 'u_laser_dir'),
      bossLaserActiveLoc: gl.getUniformLocation(program, 'u_boss_laser_active'),
      bossLaserOriginLoc: gl.getUniformLocation(program, 'u_boss_laser_origin'),
      bossLaserDirLoc: gl.getUniformLocation(program, 'u_boss_laser_dir'),
      ramLoc: gl.getUniformLocation(program, 'u_ramming'),
      flashLoc: gl.getUniformLocation(program, 'u_flash'),
      expCountLoc: gl.getUniformLocation(program, 'u_exp_count'),
      expPosLoc: gl.getUniformLocation(program, 'u_exp_pos'),
      expIntensityLoc: gl.getUniformLocation(program, 'u_exp_intensity'),
      expColorLoc: gl.getUniformLocation(program, 'u_exp_color'),
    };
  }, []);

  // Вспышка фиолетовых молний по земле при уроне главного героя
  const createPlayerDamageLightning = useCallback((px: number, py: number) => {
    const gd = gameData.current;
    playSfx('lightning');

    for (let b = 0; b < 8; b++) {
      const baseAngle = (Math.PI * 2 * b) / 8 + (Math.random() - 0.5) * 0.4;
      const points: Array<[number, number]> = [[px, py]];
      let curX = px;
      let curY = py;
      const segCount = Math.floor(Math.random() * 5) + 4;
      const segLen = Math.random() * 12 + 10;

      for (let s = 0; s < segCount; s++) {
        const jaggedAngle = baseAngle + (Math.random() - 0.5) * 0.8;
        curX += Math.cos(jaggedAngle) * segLen;
        curY += Math.sin(jaggedAngle) * segLen;
        points.push([curX, curY]);

        gd.particles.push({
          x: curX,
          y: curY,
          dx: (Math.random() - 0.5) * 4,
          dy: (Math.random() - 0.5) * 4,
          life: 14,
          maxLife: 14,
          color: '#e879f9',
          size: 2,
          isSpark: true,
        });
      }

      gd.groundLightnings.push({
        points,
        life: 16,
        maxLife: 16,
        color: b % 2 === 0 ? '#c084fc' : '#e879f9',
      });
    }

    for (let k = 0; k < 14; k++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = Math.random() * 6 + 2;
      gd.particles.push({
        x: px,
        y: py,
        dx: Math.cos(ang) * spd,
        dy: Math.sin(ang) * spd,
        life: 20,
        maxLife: 20,
        color: '#ffffff',
        size: 2.5,
        isSpark: true,
      });
    }
  }, [playSfx]);

  // Быстрый и плавный взрыв искрами (без просадок FPS и без трещин)
  const createEnemyDeathExplosion = useCallback((x: number, y: number, isRam: boolean) => {
    const gd = gameData.current;
    playSfx('explode');

    gd.screenShake = Math.max(gd.screenShake, isRam ? 7.0 : 4.5);

    // Легкий шейдерный свет (короткий импульс на 18 кадров)
    gd.explosionLights.push({
      x,
      y,
      life: 18,
      maxLife: 18,
      radius: 190,
      color: isRam ? [1.0, 0.15, 0.6] : [1.0, 0.35, 0.1],
    });
    if (gd.explosionLights.length > 5) gd.explosionLights.shift();

    // Быстрые и аккуратные искры (25-32 шт, короткая жизнь)
    const count = isRam ? 32 : 24;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.45;
      const speed = Math.random() * 7.5 + 3.2;
      const colors = isRam
        ? ['#ffffff', '#ff69b4', '#ff007f', '#e879f9', '#c084fc']
        : ['#ffffff', '#fde047', '#f97316', '#ef4444', '#dc2626'];
      const maxLife = Math.floor(Math.random() * 10) + 12;

      gd.particles.push({
        x,
        y,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        life: maxLife,
        maxLife,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 2.8 + 1.6,
        isSpark: true,
      });
    }

    // Небольшое быстрое пятнышко остаточного свечения
    gd.plasmaEmbers.push({
      x,
      y,
      life: 25,
      maxLife: 25,
      color: isRam ? '#ff007f' : '#ef4444',
      size: 18,
    });
  }, [playSfx]);

  // Спавн врагов и логика боссов
  const spawnEnemy = useCallback(() => {
    const gd = gameData.current;
    if (gd.enemiesRemaining <= 0) return;

    // --- УРОВЕНЬ 2: 1 БОСС ПРИ 1 ОСТАВШЕМСЯ ВРАГЕ ---
    if (gd.level === 2 && gd.enemiesRemaining === 1 && gd.bosses.length === 0) {
      gd.bosses.push({
        id: 'titan-1',
        name: 'ABYSSAL TITAN',
        x: gd.width / 2,
        y: 120,
        hp: 25,
        maxHp: 25,
        size: 32,
        speed: 0.8,
        attackCooldown: 150,
        attackTimer: 70,
        isWarning: false,
        warningTicks: 0,
        currentAimAngle: 0,
        color: '#ef4444',
      });
      gd.enemiesRemaining -= 1;
      setEnemiesLeft(gd.enemiesRemaining);
      return;
    }

    // --- УРОВЕНЬ 3: СНАЧАЛА 2 БОССА, А ПОСЛЕ СМЕРТИ ОДНОГО — СПАВНИТСЯ 3-Й ОСОБЕННЫЙ ---
    if (gd.level === 3 && gd.enemiesRemaining <= 2 && gd.level3Phase === 0) {
      gd.level3Phase = 1;
      // Босс 1 (Titan Alpha) - слегка уменьшенный размер (28)
      gd.bosses.push({
        id: 'titan-alpha',
        name: 'TITAN ALPHA',
        x: 270,
        y: 130,
        hp: 20,
        maxHp: 20,
        size: 28,
        speed: 0.85,
        attackCooldown: 160,
        attackTimer: 50,
        isWarning: false,
        warningTicks: 0,
        currentAimAngle: 0,
        color: '#ef4444',
      });
      // Босс 2 (Titan Beta) - слегка уменьшенный размер (28)
      gd.bosses.push({
        id: 'titan-beta',
        name: 'TITAN BETA',
        x: 630,
        y: 130,
        hp: 20,
        maxHp: 20,
        size: 28,
        speed: 0.85,
        attackCooldown: 160,
        attackTimer: 90,
        isWarning: false,
        warningTicks: 0,
        currentAimAngle: 0,
        color: '#f97316',
      });
      gd.enemiesRemaining = 0;
      setEnemiesLeft(0);
      return;
    }

    const sides = ['top', 'bottom', 'left', 'right'];
    const side = sides[Math.floor(Math.random() * sides.length)];
    let x = 0;
    let y = 0;
    if (side === 'top') {
      x = Math.random() * (gd.width - 200) + 100;
      y = 45;
    } else if (side === 'bottom') {
      x = Math.random() * (gd.width - 200) + 100;
      y = gd.height - 45;
    } else if (side === 'left') {
      x = 45;
      y = Math.random() * (gd.height - 200) + 100;
    } else {
      x = gd.width - 45;
      y = Math.random() * (gd.height - 200) + 100;
    }

    // Стреляющие квадраты тоже КРАСНЫЕ с особенной огненной плазмой внутри
    const isElite = gd.level === 3 && (gd.enemies.filter(e => e.isEliteQuad).length === 0 || Math.random() < 0.28);

    gd.enemies.push({
      x,
      y,
      vx: 0,
      vy: 0,
      baseSpeed: isElite ? 1.7 : Math.random() * 0.8 + 1.0,
      speed: 1.5,
      offset: Math.random() * 6.28,
      timer: Math.floor(Math.random() * 60) + 40,
      mode: isElite ? 'rush' : 'flank',
      isEliteQuad: isElite,
      shootTimer: isElite ? 90 : undefined,
      ramChargeTimer: isElite ? 220 : undefined,
      ramDashTimer: 0,
      isRamming: false,
    });
    gd.enemiesRemaining -= 1;
    setEnemiesLeft(gd.enemiesRemaining);
  }, []);

  // Инициализация уровня
  const startLevel = useCallback((lvl: number) => {
    const gd = gameData.current;
    gd.level = lvl;
    setCurrentLevel(lvl);
    gd.player = { x: gd.width / 2, y: (gd.height + 50) / 2, size: 16, vx: 0, vy: 0 };
    gd.mouse = { x: gd.width / 2, y: (gd.height + 50) / 2 };
    gd.enemies = [];
    gd.flyingLasers = [];
    gd.particles = [];
    gd.plasmaEmbers = [];
    gd.explosionLights = [];
    gd.groundLightnings = [];
    gd.bosses = [];
    gd.level3Phase = 0;
    gd.lives = 3;
    gd.ramStamina = 100;
    gd.laserStamina = 100;
    gd.isRamming = false;
    gd.ramExhausted = false;
    gd.laserExhausted = false;
    gd.activeLaser = false;
    gd.invulnerabilityTimer = 0;
    gd.damageFlash = 0;
    gd.screenShake = 0;
    gd.animTick = 0;
    gd.spawnCounter = 0;
    gd.muzzleFlashTime = 0;

    if (lvl === 2) gd.maxEnemies = 40;
    else if (lvl >= 3) gd.maxEnemies = 55;
    else gd.maxEnemies = 15;

    gd.enemiesRemaining = gd.maxEnemies;

    setLives(3);
    setRamStamina(100);
    setLaserStamina(100);
    setEnemiesLeft(gd.maxEnemies);
    setBossesList([]);
    setGameState('PLAYING');

    if (lvl === 1) setShowTutorial(true);
    else setShowTutorial(false);

    for (let i = 0; i < 5; i++) spawnEnemy();

    if (audioRef.current && !isMuted) {
      audioRef.current.play().catch(() => {});
    }
  }, [isMuted, spawnEnemy]);

  const togglePause = useCallback(() => {
    if (showTutorial || gameState === 'VICTORY' || gameState === 'GAMEOVER' || gameState === 'MENU') return;
    setGameState(prev => {
      const next = prev === 'PAUSED' ? 'PLAYING' : 'PAUSED';
      if (audioRef.current) {
        if (next === 'PAUSED') audioRef.current.pause();
        else if (!isMuted) audioRef.current.play().catch(() => {});
      }
      return next;
    });
  }, [showTutorial, gameState, isMuted]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        gameData.current.spacePressed = true;
      } else if (e.code === 'Escape') {
        e.preventDefault();
        togglePause();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        gameData.current.spacePressed = false;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [togglePause]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = gameCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scaleX = 900 / rect.width;
    const scaleY = 650 / rect.height;
    gameData.current.mouse.x = (e.clientX - rect.left) * scaleX;
    gameData.current.mouse.y = (e.clientY - rect.top) * scaleY;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (gameState !== 'PLAYING' || showTutorial) return;
    if (e.button === 2) {
      e.preventDefault();
      const gd = gameData.current;
      if (gd.mouse.y <= 24 || gd.mouse.y >= gd.height - 24 || gd.laserStamina <= 0 || gd.laserExhausted || gd.activeLaser) return;
      gd.rightClicked = true;
      gd.laserAngle = Math.atan2(gd.mouse.y - gd.player.y, gd.mouse.x - gd.player.x);
      gd.activeLaser = true;
      gd.muzzleFlashTime = 15;
      playSfx('laser');
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 2) {
      e.preventDefault();
      const gd = gameData.current;
      if (gd.rightClicked && gd.activeLaser) {
        gd.rightClicked = false;
        const dx = Math.cos(gd.laserAngle) * 22;
        const dy = Math.sin(gd.laserAngle) * 22;
        gd.flyingLasers.push({
          x: gd.player.x,
          y: gd.player.y,
          dx,
          dy,
          life: 90,
          isBoss: false,
        });
        gd.activeLaser = false;
        playSfx('laser');
      }
    }
  };

  // Функция нанесения урона игроку с проверкой неуязвимости и кулдауна 2 сек
  const damagePlayer = useCallback(() => {
    const gd = gameData.current;
    if (gd.invulnerabilityTimer > 0) return; // Неуязвим во время кулдауна!

    gd.lives -= 1;
    setLives(gd.lives);
    gd.invulnerabilityTimer = 120; // 2.0 секунды кулдауна урона (120 тиков)
    gd.damageFlash = 1.0;
    gd.screenShake = Math.max(gd.screenShake, 24.0); // Сильнее трясет экран при ударе!
    createPlayerDamageLightning(gd.player.x, gd.player.y);

    if (gd.lives <= 0) {
      setGameState('GAMEOVER');
      playSfx('gameover');
    }
  }, [createPlayerDamageLightning, playSfx]);

  // Главный 60 FPS цикл
  useEffect(() => {
    let animId: number;

    const loop = (timestamp: number) => {
      const gd = gameData.current;

      // 1. WebGL освещение
      if (glRef.current) {
        const {
          gl, program, timeLoc, resLoc, playerLoc,
          laserActiveLoc, laserOriginLoc, laserDirLoc,
          bossLaserActiveLoc, bossLaserOriginLoc, bossLaserDirLoc,
          ramLoc, flashLoc, expCountLoc, expPosLoc, expIntensityLoc, expColorLoc,
        } = glRef.current;

        gl.useProgram(program);
        if (timeLoc) gl.uniform1f(timeLoc, timestamp * 0.001);
        if (resLoc) gl.uniform2f(resLoc, gd.width, gd.height);
        if (playerLoc) gl.uniform2f(playerLoc, gd.player.x, gd.height - gd.player.y);
        if (ramLoc) gl.uniform1f(ramLoc, gd.isRamming ? 1.0 : 0.0);
        if (flashLoc) gl.uniform1f(flashLoc, gd.damageFlash);

        if (laserActiveLoc) gl.uniform1f(laserActiveLoc, (gd.rightClicked && gd.activeLaser) ? 1.0 : 0.0);
        if (laserOriginLoc) gl.uniform2f(laserOriginLoc, gd.player.x, gd.height - gd.player.y);
        if (laserDirLoc) gl.uniform2f(laserDirLoc, Math.cos(gd.laserAngle), -Math.sin(gd.laserAngle));

        const bossLaser = gd.flyingLasers.find(l => l.isBoss);
        if (bossLaserActiveLoc) gl.uniform1f(bossLaserActiveLoc, bossLaser ? 1.0 : 0.0);
        if (bossLaserOriginLoc && bossLaser) gl.uniform2f(bossLaserOriginLoc, bossLaser.x, gd.height - bossLaser.y);
        if (bossLaserDirLoc && bossLaser && bossLaser.angle !== undefined) {
          gl.uniform2f(bossLaserDirLoc, Math.cos(bossLaser.angle), -Math.sin(bossLaser.angle));
        }

        // Передача источников света от взрывов в шейдер (до 8 источников с динамическим цветом)
        const activeExps = gd.explosionLights.slice(-8);
        if (expCountLoc) gl.uniform1i(expCountLoc, activeExps.length);
        if (expPosLoc) {
          const flatPos: number[] = [];
          for (let i = 0; i < 8; i++) {
            if (i < activeExps.length) {
              flatPos.push(activeExps[i].x, gd.height - activeExps[i].y);
            } else {
              flatPos.push(0, 0);
            }
          }
          gl.uniform2fv(expPosLoc, new Float32Array(flatPos));
        }
        if (expIntensityLoc) {
          const flatInt: number[] = [];
          for (let i = 0; i < 8; i++) {
            if (i < activeExps.length) {
              flatInt.push(activeExps[i].life / activeExps[i].maxLife);
            } else {
              flatInt.push(0);
            }
          }
          gl.uniform1fv(expIntensityLoc, new Float32Array(flatInt));
        }
        if (expColorLoc) {
          const flatCols: number[] = [];
          for (let i = 0; i < 8; i++) {
            if (i < activeExps.length) {
              flatCols.push(...activeExps[i].color);
            } else {
              flatCols.push(0, 0, 0);
            }
          }
          gl.uniform3fv(expColorLoc, new Float32Array(flatCols));
        }

        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      // --- ЛОГИКА ГЛАВНОГО МЕНЮ (БОЛЬШИЕ ГРАДИЕНТНЫЕ ПЯТНА + ЛАЗЕРЫ В СТИЛЕ БОССОВ) ---
      if (gameState === 'MENU') {
        gd.animTick++;

        // Движение больших градиентных пятен туманности
        for (const p of gd.menuNebulaPatches) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 100 || p.x > gd.width - 100) p.vx *= -1;
          if (p.y < 100 || p.y > gd.height - 100) p.vy *= -1;
        }

        // Случайные лазеры боссов на фоне меню!
        if (Math.random() < 0.035) {
          const angle = Math.random() * Math.PI * 2;
          gd.menuBossLasers.push({
            x: Math.random() * (gd.width - 150) + 75,
            y: Math.random() * (gd.height - 150) + 75,
            angle,
            life: 38,
            maxLife: 38,
            color: Math.random() < 0.75 ? '#ef4444' : '#f97316',
          });
          playSfx('boss_laser');
          gd.screenShake = 6.0;
        }

        // Обновление лазеров меню
        for (let i = gd.menuBossLasers.length - 1; i >= 0; i--) {
          const bl = gd.menuBossLasers[i];
          bl.life--;
          if (bl.life <= 0) gd.menuBossLasers.splice(i, 1);
        }
      }

      // 2. ИГРОВОЙ ПРОЦЕСС
      if (gameState === 'PLAYING' && !showTutorial) {
        gd.animTick++;

        if (gd.damageFlash > 0) gd.damageFlash = Math.max(0, gd.damageFlash - 0.07);
        if (gd.screenShake > 0) gd.screenShake = Math.max(0, gd.screenShake - 0.55);
        if (gd.muzzleFlashTime > 0) gd.muzzleFlashTime--;

        // Снижение кулдауна неуязвимости (2 секунды)
        if (gd.invulnerabilityTimer > 0) {
          gd.invulnerabilityTimer--;
        }

        // Обновление источников света от взрывов
        for (let i = gd.explosionLights.length - 1; i >= 0; i--) {
          gd.explosionLights[i].life--;
          if (gd.explosionLights[i].life <= 0) gd.explosionLights.splice(i, 1);
        }

        // Обновление молний на земле
        for (let i = gd.groundLightnings.length - 1; i >= 0; i--) {
          gd.groundLightnings[i].life--;
          if (gd.groundLightnings[i].life <= 0) gd.groundLightnings.splice(i, 1);
        }

        // Обновление остаточных плазменных пятен
        for (let i = gd.plasmaEmbers.length - 1; i >= 0; i--) {
          gd.plasmaEmbers[i].life--;
          if (gd.plasmaEmbers[i].life <= 0) gd.plasmaEmbers.splice(i, 1);
        }

        // Спавн волн
        if (gd.enemies.length === 0 && gd.bosses.length === 0 && gd.enemiesRemaining > 0) {
          const count = Math.min(5, gd.enemiesRemaining);
          for (let i = 0; i < count; i++) spawnEnemy();
          gd.spawnCounter = 0;
        }

        gd.spawnCounter++;
        if (gd.spawnCounter >= 420) {
          gd.spawnCounter = 0;
          for (let i = 0; i < 5; i++) spawnEnemy();
        }

        // Стамина
        if (gd.rightClicked) {
          gd.laserStamina = Math.max(0, gd.laserStamina - 2.4);
          if (gd.laserStamina <= 5.0) {
            gd.laserExhausted = true;
            gd.rightClicked = false;
            gd.activeLaser = false;
          }
        } else {
          const regen = gd.laserExhausted ? 0.75 : 1.5;
          gd.laserStamina = Math.min(100, gd.laserStamina + regen);
          if (gd.laserStamina >= 100) gd.laserExhausted = false;
        }

        if (gd.spacePressed && gd.ramStamina > 0 && !gd.ramExhausted) {
          gd.isRamming = true;
          gd.ramStamina = Math.max(0, gd.ramStamina - 4.5);
          if (gd.ramStamina <= 5.0) gd.ramExhausted = true;
        } else {
          gd.isRamming = false;
          const regen = gd.ramExhausted ? 0.6 : 1.2;
          gd.ramStamina = Math.min(100, gd.ramStamina + regen);
          if (gd.ramStamina >= 100) gd.ramExhausted = false;
        }

        // Движение игрока
        const distToMouse = Math.hypot(gd.mouse.x - gd.player.x, gd.mouse.y - gd.player.y);
        if (distToMouse > 5) {
          const angle = Math.atan2(gd.mouse.y - gd.player.y, gd.mouse.x - gd.player.x);
          const currentSpeed = Math.min(5.0 * (gd.isRamming ? 1.4 : 1.0), distToMouse * 0.08);
          gd.player.vx = Math.cos(angle) * currentSpeed;
          gd.player.vy = Math.sin(angle) * currentSpeed;
          gd.player.x += gd.player.vx;
          gd.player.y += gd.player.vy;

          if (currentSpeed > 1.2) {
            const oppAngle = angle + Math.PI + (Math.random() - 0.5) * 0.6;
            const pSpeed = Math.random() * 2.5 + 1.2;
            const flameColors = gd.isRamming
              ? ['#ff007f', '#ff69b4', '#ffffff', '#e879f9']
              : ['#c084fc', '#e879f9', '#a855f7', '#38bdf8', '#ffffff'];
            gd.particles.push({
              x: gd.player.x - Math.cos(angle) * 12,
              y: gd.player.y - Math.sin(angle) * 12,
              dx: Math.cos(oppAngle) * pSpeed,
              dy: Math.sin(oppAngle) * pSpeed,
              life: 14,
              maxLife: 14,
              color: flameColors[Math.floor(Math.random() * flameColors.length)],
              size: Math.random() * 3.5 + 1.8,
              isFlame: true,
            });
          }
        }

        // Границы каменных стен арены и 4 скошенных угловых бастиона
        gd.player.x = Math.max(gd.player.size + 24, Math.min(gd.width - gd.player.size - 24, gd.player.x));
        gd.player.y = Math.max(gd.player.size + 24, Math.min(gd.height - gd.player.size - 24, gd.player.y));

        const cornerCut = 88 + gd.player.size;
        // Верхний левый угол
        if (gd.player.x + gd.player.y < cornerCut) {
          const overlap = cornerCut - (gd.player.x + gd.player.y);
          gd.player.x += overlap * 0.5;
          gd.player.y += overlap * 0.5;
        }
        // Верхний правый угол
        if ((gd.width - gd.player.x) + gd.player.y < cornerCut) {
          const overlap = cornerCut - ((gd.width - gd.player.x) + gd.player.y);
          gd.player.x -= overlap * 0.5;
          gd.player.y += overlap * 0.5;
        }
        // Нижний левый угол
        if (gd.player.x + (gd.height - gd.player.y) < cornerCut) {
          const overlap = cornerCut - (gd.player.x + (gd.height - gd.player.y));
          gd.player.x += overlap * 0.5;
          gd.player.y -= overlap * 0.5;
        }
        // Нижний правый угол
        if ((gd.width - gd.player.x) + (gd.height - gd.player.y) < cornerCut) {
          const overlap = cornerCut - ((gd.width - gd.player.x) + (gd.height - gd.player.y));
          gd.player.x -= overlap * 0.5;
          gd.player.y -= overlap * 0.5;
        }

        // Наведение активного лазера
        if (gd.rightClicked && gd.activeLaser) {
          const targetAngle = Math.atan2(gd.mouse.y - gd.player.y, gd.mouse.x - gd.player.x);
          const diff = ((targetAngle - gd.laserAngle + Math.PI) % (2 * Math.PI)) - Math.PI;
          gd.laserAngle += diff * 0.04;

          const length = 1500;
          const dirx = Math.cos(gd.laserAngle);
          const diry = Math.sin(gd.laserAngle);

          // Боковые струи плазмы у основания
          const perpAngle = gd.laserAngle + Math.PI / 2;
          for (let s = -1; s <= 1; s += 2) {
            const sideAng = perpAngle * s + (Math.random() - 0.5) * 0.5;
            gd.particles.push({
              x: gd.player.x + Math.cos(gd.laserAngle) * 8,
              y: gd.player.y + Math.sin(gd.laserAngle) * 8,
              dx: Math.cos(sideAng) * (Math.random() * 3.5 + 2),
              dy: Math.sin(sideAng) * (Math.random() * 3.5 + 2),
              life: 8,
              maxLife: 8,
              color: '#38bdf8',
              size: 2,
              isSpark: true,
            });
          }

          // Урон боссам от лазера
          for (let bIdx = gd.bosses.length - 1; bIdx >= 0; bIdx--) {
            const boss = gd.bosses[bIdx];
            const bx = boss.x;
            const by = boss.y;
            const proj = (bx - gd.player.x) * dirx + (by - gd.player.y) * diry;

            if (proj >= 0 && proj <= length) {
              const cx = gd.player.x + dirx * proj;
              const cy = gd.player.y + diry * proj;
              if (Math.hypot(bx - cx, by - cy) < boss.size) {
                let dmg = 0.4;
                if (boss.isBarrierBoss && boss.barrierAngle !== undefined) {
                  const hitAngle = Math.atan2(cy - by, cx - bx);
                  const angleDiff = Math.abs(((hitAngle - boss.barrierAngle + Math.PI) % (Math.PI * 2)) - Math.PI);
                  if (angleDiff < 1.0) {
                    dmg = 0.05;
                    for (let k = 0; k < 3; k++) {
                      gd.particles.push({
                        x: cx, y: cy,
                        dx: (Math.random() - 0.5) * 6,
                        dy: (Math.random() - 0.5) * 6,
                        life: 8, maxLife: 8,
                        color: '#38bdf8', size: 3, isSpark: true,
                      });
                    }
                  }
                }

                boss.hp -= dmg;
                playSfx('hit');

                for (let k = 0; k < 3; k++) {
                  gd.particles.push({
                    x: cx, y: cy,
                    dx: (Math.random() - 0.5) * 7,
                    dy: (Math.random() - 0.5) * 7,
                    life: 10, maxLife: 10,
                    color: boss.color, size: 2.5, isSpark: true,
                  });
                }

                if (boss.hp <= 0) {
                  createEnemyDeathExplosion(bx, by, true);
                  gd.bosses.splice(bIdx, 1);
                  playSfx('victory');

                  // --- ЛОГИКА 3 УРОВНЯ: ЕСЛИ УМЕР 1 ИЗ ТИТАНОВ, СПАВНИМ 3-ГО ОСОБЕННОГО БОССА! ---
                  if (gd.level === 3 && gd.level3Phase === 1) {
                    gd.level3Phase = 2; // Призван Aegis Overlord!
                    gd.bosses.push({
                      id: 'aegis-overlord',
                      name: 'AEGIS OVERLORD',
                      x: 450,
                      y: 110,
                      hp: 35,
                      maxHp: 35,
                      size: 34, // слегка уменьшенный размер
                      speed: 0.75,
                      attackCooldown: 140,
                      attackTimer: 70,
                      isWarning: false,
                      warningTicks: 0,
                      currentAimAngle: 0,
                      color: '#a855f7',
                      isBarrierBoss: true,
                      barrierAngle: 0,
                      dashCooldown: 180,
                      radialNovaCooldown: 220,
                    });
                    gd.screenShake = 16.0;
                    playSfx('lightning');
                  }
                }
              }
            }
          }

          // Урон врагам
          for (let i = gd.enemies.length - 1; i >= 0; i--) {
            const en = gd.enemies[i];
            const proj = (en.x - gd.player.x) * dirx + (en.y - gd.player.y) * diry;
            if (proj >= 0 && proj <= length) {
              const cx = gd.player.x + dirx * proj;
              const cy = gd.player.y + diry * proj;
              if (Math.hypot(en.x - cx, en.y - cy) < 16) {
                createEnemyDeathExplosion(en.x, en.y, false);
                gd.enemies.splice(i, 1);
              }
            }
          }
        }

        // Обновление всех активных боссов
        for (let bIdx = gd.bosses.length - 1; bIdx >= 0; bIdx--) {
          const boss = gd.bosses[bIdx];
          const angle = Math.atan2(gd.player.y - boss.y, gd.player.x - boss.x);

          if (boss.isBarrierBoss) {
            boss.barrierAngle = (boss.barrierAngle || 0) + 0.035;

            boss.dashCooldown = (boss.dashCooldown || 180) - 1;
            if (boss.dashCooldown <= 0) {
              boss.dashCooldown = 200;
              boss.x += Math.cos(angle) * 160;
              boss.y += Math.sin(angle) * 160;
              boss.x = Math.max(70, Math.min(gd.width - 70, boss.x));
              boss.y = Math.max(120, Math.min(gd.height - 70, boss.y));
              gd.screenShake = 14;
              playSfx('ram');
              createEnemyDeathExplosion(boss.x, boss.y, true);
            }

            boss.radialNovaCooldown = (boss.radialNovaCooldown || 220) - 1;
            if (boss.radialNovaCooldown <= 0) {
              boss.radialNovaCooldown = 220;
              gd.screenShake = 16;
              playSfx('boss_laser');
              const novaProjectiles = 16;
              for (let n = 0; n < novaProjectiles; n++) {
                const nAng = (Math.PI * 2 * n) / novaProjectiles;
                gd.flyingLasers.push({
                  x: boss.x,
                  y: boss.y,
                  dx: Math.cos(nAng) * 6,
                  dy: Math.sin(nAng) * 6,
                  life: 80,
                  isEnemyBolt: true,
                  color: '#a855f7',
                });
              }
            }
          }

          boss.x += Math.cos(angle) * boss.speed;
          boss.y += Math.sin(angle) * boss.speed;
          boss.x = Math.max(50, Math.min(gd.width - 50, boss.x));
          boss.y = Math.max(100, Math.min(gd.height - 50, boss.y));

          if (Math.random() < 0.6) {
            const opp = angle + Math.PI + (Math.random() - 0.5) * 0.8;
            gd.particles.push({
              x: boss.x - Math.cos(angle) * 28,
              y: boss.y - Math.sin(angle) * 28,
              dx: Math.cos(opp) * (Math.random() * 2 + 1),
              dy: Math.sin(opp) * (Math.random() * 2 + 1),
              life: 20,
              maxLife: 20,
              color: boss.color,
              size: Math.random() * 5 + 3,
              isFlame: true,
            });
          }

          if (!boss.isWarning) {
            boss.attackTimer--;
            if (boss.attackTimer <= 0) {
              boss.isWarning = true;
              boss.warningTicks = 65;
              boss.currentAimAngle = Math.atan2(gd.player.y - boss.y, gd.player.x - boss.x);
              playSfx('boss_laser');
            }
          } else {
            boss.warningTicks--;
            const desired = Math.atan2(gd.player.y - boss.y, gd.player.x - boss.x);
            const diff = ((desired - boss.currentAimAngle + Math.PI) % (2 * Math.PI)) - Math.PI;
            const maxTurn = 0.012;
            if (Math.abs(diff) > maxTurn) {
              boss.currentAimAngle += diff > 0 ? maxTurn : -maxTurn;
            } else {
              boss.currentAimAngle = desired;
            }

            if (boss.warningTicks <= 0) {
              boss.isWarning = false;
              boss.attackTimer = boss.attackCooldown;
              gd.flyingLasers.push({
                x: boss.x,
                y: boss.y,
                dx: 0,
                dy: 0,
                angle: boss.currentAimAngle,
                life: 40,
                isBoss: true,
              });
              gd.screenShake = 18;
              playSfx('boss_laser');
            }
          }

          // Столкновение босса с игроком
          if (Math.hypot(gd.player.x - boss.x, gd.player.y - boss.y) < gd.player.size + boss.size - 5) {
            damagePlayer();
          }
        }

        // Обновление лазеров и снарядов
        for (let i = gd.flyingLasers.length - 1; i >= 0; i--) {
          const fl = gd.flyingLasers[i];
          fl.life--;
          if (fl.life <= 0) {
            gd.flyingLasers.splice(i, 1);
            continue;
          }

          if (fl.isBoss && fl.angle !== undefined) {
            gd.screenShake = Math.max(gd.screenShake, 14);

            const length = 1500;
            const dirx = Math.cos(fl.angle);
            const diry = Math.sin(fl.angle);
            const proj = (gd.player.x - fl.x) * dirx + (gd.player.y - fl.y) * diry;
            if (proj >= 0 && proj <= length) {
              const cx = fl.x + dirx * proj;
              const cy = fl.y + diry * proj;
              if (Math.hypot(gd.player.x - cx, gd.player.y - cy) < gd.player.size + 8) {
                damagePlayer();
                gd.flyingLasers.splice(i, 1);
              }
            }
          } else if (fl.isEnemyBolt) {
            fl.x += fl.dx;
            fl.y += fl.dy;

            // ЕСЛИ ИГРОК В ТАРАНЕ: НЕУЯЗВИМ К ВРАЖЕСКИМ ВЫСТРЕЛАМ (ОНИ ОТРАЖАЮТСЯ ИСКРАМИ!)
            if (Math.hypot(gd.player.x - fl.x, gd.player.y - fl.y) < gd.player.size + (gd.isRamming ? 16 : 6)) {
              if (gd.isRamming) {
                // Отражение выстрела
                playSfx('deflect');
                for (let k = 0; k < 6; k++) {
                  gd.particles.push({
                    x: fl.x, y: fl.y,
                    dx: (Math.random() - 0.5) * 8, dy: (Math.random() - 0.5) * 8,
                    life: 10, maxLife: 10, color: '#ff69b4', size: 2.5, isSpark: true,
                  });
                }
                gd.flyingLasers.splice(i, 1);
              } else {
                damagePlayer();
                gd.flyingLasers.splice(i, 1);
              }
            }
          } else {
            fl.x += fl.dx;
            fl.y += fl.dy;

            for (let k = gd.enemies.length - 1; k >= 0; k--) {
              const en = gd.enemies[k];
              if (Math.hypot(fl.x - en.x, fl.y - en.y) < 22) {
                createEnemyDeathExplosion(en.x, en.y, false);
                gd.enemies.splice(k, 1);
                break;
              }
            }
          }
        }

        // Обновление рядовых врагов и элитных квадратиков
        for (let i = gd.enemies.length - 1; i >= 0; i--) {
          const en = gd.enemies[i];

          // Границы каменных стен арены и бастионов для врагов
          en.x = Math.max(26, Math.min(gd.width - 26, en.x));
          en.y = Math.max(26, Math.min(gd.height - 26, en.y));

          const enCorner = 86;
          if (en.x + en.y < enCorner) {
            const o = enCorner - (en.x + en.y);
            en.x += o * 0.5; en.y += o * 0.5;
          }
          if ((gd.width - en.x) + en.y < enCorner) {
            const o = enCorner - ((gd.width - en.x) + en.y);
            en.x -= o * 0.5; en.y += o * 0.5;
          }
          if (en.x + (gd.height - en.y) < enCorner) {
            const o = enCorner - (en.x + (gd.height - en.y));
            en.x += o * 0.5; en.y -= o * 0.5;
          }
          if ((gd.width - en.x) + (gd.height - en.y) < enCorner) {
            const o = enCorner - ((gd.width - en.x) + (gd.height - en.y));
            en.x -= o * 0.5; en.y -= o * 0.5;
          }

          // Таран игрока уничтожает врага
          if (gd.isRamming && Math.hypot(gd.player.x - en.x, gd.player.y - en.y) < gd.player.size + 24) {
            createEnemyDeathExplosion(en.x, en.y, true);
            gd.enemies.splice(i, 1);
            continue;
          }

          // ЛОГИКА ЭЛИТНОГО КРАСНОГО КВАДРАТИКА: Стрельба и Таран
          if (en.isEliteQuad) {
            if (en.shootTimer !== undefined) {
              en.shootTimer--;
              if (en.shootTimer <= 0) {
                en.shootTimer = 110;
                const bAng = Math.atan2(gd.player.y - en.y, gd.player.x - en.x);
                gd.flyingLasers.push({
                  x: en.x,
                  y: en.y,
                  dx: Math.cos(bAng) * 7.5,
                  dy: Math.sin(bAng) * 7.5,
                  life: 75,
                  isEnemyBolt: true,
                  color: '#f97316', // Красный/огненный выстрел!
                });
                playSfx('laser');
              }
            }

            if (en.ramChargeTimer !== undefined) {
              en.ramChargeTimer--;
              if (en.ramChargeTimer <= 0 && en.ramDashTimer === 0) {
                en.isRamming = true;
                en.ramDashTimer = 35;
                en.ramChargeTimer = 220;
                playSfx('ram');
              }
            }

            if (en.ramDashTimer && en.ramDashTimer > 0) {
              en.ramDashTimer--;
              if (en.ramDashTimer <= 0) en.isRamming = false;
            }
          }

          en.timer--;
          if (en.timer <= 0) {
            en.timer = Math.floor(Math.random() * 60) + 40;
            const modes: ('flank' | 'rush' | 'retreat' | 'circle')[] = ['flank', 'rush', 'retreat', 'circle'];
            en.mode = modes[Math.floor(Math.random() * modes.length)];
            en.baseSpeed = en.isEliteQuad ? 1.8 : Math.random() * 1.1 + 0.9;
          }

          const dist = Math.hypot(gd.player.x - en.x, gd.player.y - en.y);
          const baseAngle = Math.atan2(gd.player.y - en.y, gd.player.x - en.x);
          let moveAngle = baseAngle;
          if (en.mode === 'flank') {
            moveAngle = baseAngle + Math.sin(gd.spawnCounter * 0.06 + en.offset) * 1.4;
          } else if (en.mode === 'retreat' && dist < 150) {
            moveAngle = baseAngle + Math.PI;
          } else if (en.mode === 'circle') {
            moveAngle = baseAngle + Math.PI / 2;
          }

          let spd = en.baseSpeed * (en.mode === 'rush' ? 1.5 : 1.0);
          if (en.isRamming) spd = 6.8;

          en.vx = Math.cos(moveAngle) * spd;
          en.vy = Math.sin(moveAngle) * spd;
          en.x += en.vx;
          en.y += en.vy;

          if (Math.random() < 0.75) {
            const oppAngle = moveAngle + Math.PI + (Math.random() - 0.5) * 0.7;
            const flameColors = en.isEliteQuad
              ? ['#ef4444', '#f97316', '#fef08a', '#dc2626']
              : ['#ef4444', '#f97316', '#dc2626'];
            const fCol = flameColors[Math.floor(Math.random() * flameColors.length)];

            gd.particles.push({
              x: en.x,
              y: en.y,
              dx: Math.cos(oppAngle) * (Math.random() * 2.2 + 1),
              dy: Math.sin(oppAngle) * (Math.random() * 2.2 + 1),
              life: 14,
              maxLife: 14,
              color: fCol,
              size: Math.random() * 3 + 1.2,
              isFlame: true,
            });

            if (Math.random() < 0.35) {
              gd.plasmaEmbers.push({
                x: en.x,
                y: en.y,
                life: 30,
                maxLife: 30,
                color: fCol,
                size: 8,
              });
            }
          }

          // Контакт врага с игроком
          if (dist < gd.player.size + 9) {
            createEnemyDeathExplosion(en.x, en.y, false);
            gd.enemies.splice(i, 1);
            damagePlayer();
            break;
          }
        }

        // Обновление частиц (легкая, быстрая физика без просадок)
        for (let i = gd.particles.length - 1; i >= 0; i--) {
          const p = gd.particles[i];
          p.x += p.dx;
          p.y += p.dy;
          if (p.isSpark) {
            p.dx *= 0.94;
            p.dy *= 0.94;
          }
          p.life--;
          if (p.life <= 0) gd.particles.splice(i, 1);
        }

        // Проверка победы
        if (gd.enemies.length === 0 && gd.enemiesRemaining <= 0 && gd.bosses.length === 0) {
          setGameState('VICTORY');
          playSfx('victory');
          confetti({ particleCount: 140, spread: 85, origin: { y: 0.6 } });
        }

        setRamStamina(gd.ramStamina);
        setLaserStamina(gd.laserStamina);

        setBossesList(gd.bosses.map(b => ({
          name: b.name,
          hp: Math.max(0, b.hp),
          maxHp: b.maxHp,
          color: b.color,
        })));
      }

      // 3. ОТРИСОВКА НА 2D ХОЛСТЕ
      const ctx = gameCanvasRef.current?.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, gd.width, gd.height);
        ctx.save();

        if (gd.screenShake > 0) {
          const shakeX = (Math.random() - 0.5) * gd.screenShake;
          const shakeY = (Math.random() - 0.5) * gd.screenShake;
          ctx.translate(shakeX, shakeY);
        }

        // --- ДИНАМИЧНЫЙ ФОН ГЛАВНОГО МЕНЮ (БОЛЬШИЕ ГРАДИЕНТНЫЕ ПЯТНА + ЛАЗЕРЫ В СТИЛЕ БОССОВ) ---
        if (gameState === 'MENU') {
          ctx.fillStyle = '#050508';
          ctx.fillRect(0, 0, gd.width, gd.height);

          // 1. Большие переливающиеся градиентные пятна туманности
          for (const patch of gd.menuNebulaPatches) {
            const rad = ctx.createRadialGradient(patch.x, patch.y, 10, patch.x, patch.y, patch.radius);
            rad.addColorStop(0, patch.color);
            rad.addColorStop(1, 'rgba(5, 5, 8, 0)');
            ctx.fillStyle = rad;
            ctx.beginPath();
            ctx.arc(patch.x, patch.y, patch.radius, 0, Math.PI * 2);
            ctx.fill();
          }

          // 2. Лазерные выстрелы боссов на фоне меню!
          for (const bl of gd.menuBossLasers) {
            const alpha = bl.life / bl.maxLife;
            const length = 1500;
            const lx2 = bl.x + Math.cos(bl.angle) * length;
            const ly2 = bl.y + Math.sin(bl.angle) * length;
            const dirX = Math.cos(bl.angle);
            const dirY = Math.sin(bl.angle);
            const perpX = -dirY;
            const perpY = dirX;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.lineCap = 'round';

            // Боковое освещение
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.25)';
            ctx.lineWidth = 64;
            ctx.beginPath();
            ctx.moveTo(bl.x, bl.y);
            ctx.lineTo(lx2, ly2);
            ctx.stroke();

            // Внешний контур
            ctx.strokeStyle = bl.color;
            ctx.lineWidth = 24;
            ctx.shadowColor = bl.color;
            ctx.shadowBlur = 22;
            ctx.beginPath();
            ctx.moveTo(bl.x, bl.y);
            ctx.lineTo(lx2, ly2);
            ctx.stroke();

            // Средний плазменный слой
            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 12;
            ctx.beginPath();
            ctx.moveTo(bl.x, bl.y);
            ctx.lineTo(lx2, ly2);
            ctx.stroke();

            // Спиральные молнии
            ctx.strokeStyle = '#fef08a';
            ctx.lineWidth = 3;
            ctx.beginPath();
            for (let s = 0; s <= 20; s++) {
              const d = (s / 20) * 600;
              const wave = Math.sin(s * 1.5 + gd.animTick * 0.4) * 8;
              const px = bl.x + dirX * d + perpX * wave;
              const py = bl.y + dirY * d + perpY * wave;
              if (s === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.stroke();

            // Белое ядро
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(bl.x, bl.y);
            ctx.lineTo(lx2, ly2);
            ctx.stroke();

            // Вспышка у пушки
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = bl.color;
            ctx.shadowBlur = 26;
            ctx.beginPath();
            ctx.arc(bl.x, bl.y, 22, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }

        // --- ИГРОВОЙ ПРОЦЕСС ---
        if (gameState !== 'MENU') {
          // Каменный пол
          for (const tile of gd.stoneTiles) {
            ctx.fillStyle = tile.shade;
            ctx.fillRect(tile.x, tile.y, 50, 50);

            ctx.strokeStyle = '#12121a';
            ctx.strokeRect(tile.x, tile.y, 50, 50);

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
            ctx.beginPath();
            ctx.moveTo(tile.x, tile.y + 49);
            ctx.lineTo(tile.x, tile.y);
            ctx.lineTo(tile.x + 49, tile.y);
            ctx.stroke();

            if (tile.crack) {
              ctx.strokeStyle = 'rgba(20, 20, 30, 0.6)';
              ctx.beginPath();
              ctx.moveTo(tile.crack[0][0], tile.crack[0][1]);
              ctx.lineTo(tile.crack[1][0], tile.crack[1][1]);
              ctx.lineTo(tile.crack[2][0], tile.crack[2][1]);
              ctx.stroke();
            }
          }

          // Осколки
          for (const s of gd.debris) {
            ctx.fillStyle = '#171722';
            ctx.strokeStyle = '#28283a';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(s.pts[0][0], s.pts[0][1]);
            ctx.lineTo(s.pts[1][0], s.pts[1][1]);
            ctx.lineTo(s.pts[2][0], s.pts[2][1]);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }

          // Шейдерные остаточные свечения плазмы на каменном полу
          for (const emb of gd.plasmaEmbers) {
            const alpha = emb.life / emb.maxLife;
            const rad = ctx.createRadialGradient(emb.x, emb.y, 0, emb.x, emb.y, emb.size);
            rad.addColorStop(0, emb.color);
            rad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.save();
            ctx.globalAlpha = alpha * 0.45;
            ctx.fillStyle = rad;
            ctx.beginPath();
            ctx.arc(emb.x, emb.y, emb.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }

          // Вспышка фиолетовых молний по земле
          for (const lt of gd.groundLightnings) {
            const alpha = lt.life / lt.maxLife;
            ctx.save();
            ctx.strokeStyle = lt.color;
            ctx.lineWidth = 2.5 * alpha;
            ctx.shadowColor = lt.color;
            ctx.shadowBlur = 10;
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            for (let i = 0; i < lt.points.length; i++) {
              if (i === 0) ctx.moveTo(lt.points[i][0], lt.points[i][1]);
              else ctx.lineTo(lt.points[i][0], lt.points[i][1]);
            }
            ctx.stroke();
            ctx.restore();
          }


          // ====================================================
          // МОЩНЫЕ КАМЕННЫЕ СТЕНЫ И 4 СКОШЕННЫХ БАСТИОНА АРЕНЫ
          // ====================================================
          const wT = 24; // толщина стен
          const cornerCut = 86; // размер скоса бастионов

          ctx.save();

          // Верхняя каменная стена (y: 0..24)
          ctx.lineWidth = 1.5;
          for (let x = 0; x < gd.width; x += 32) {
            ctx.fillStyle = (Math.floor(x / 32)) % 2 === 0 ? '#1f1f2e' : '#181824';
            ctx.fillRect(x, 0, 32, wT);
            ctx.strokeStyle = '#0d0d14';
            ctx.strokeRect(x, 0, 32, wT);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.fillRect(x + 1, wT - 3, 30, 2);
          }

          // НИЖНЯЯ КАМЕННАЯ СТЕНА (y: 626..650) - Четкая, рельефная и видимая!
          for (let x = 0; x < gd.width; x += 32) {
            ctx.fillStyle = (Math.floor(x / 32)) % 2 === 0 ? '#222232' : '#1a1a26';
            ctx.fillRect(x, gd.height - wT, 32, wT);
            ctx.strokeStyle = '#0c0c14';
            ctx.strokeRect(x, gd.height - wT, 32, wT);
            // Верхняя фаска света на грани нижней стены
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.fillRect(x + 1, gd.height - wT + 1, 30, 2);
            // Рельефные зубцы/укрепления
            if ((Math.floor(x / 32)) % 2 === 0) {
              ctx.fillStyle = '#2c2c3e';
              ctx.fillRect(x + 8, gd.height - wT + 4, 16, 6);
              ctx.strokeStyle = '#14141e';
              ctx.strokeRect(x + 8, gd.height - wT + 4, 16, 6);
            }
          }

          // Левая стена (x: 0..24)
          for (let y = 0; y < gd.height; y += 32) {
            ctx.fillStyle = (Math.floor(y / 32)) % 2 === 0 ? '#1e1e2b' : '#161622';
            ctx.fillRect(0, y, wT, 32);
            ctx.strokeStyle = '#0d0d14';
            ctx.strokeRect(0, y, wT, 32);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.fillRect(wT - 3, y + 1, 2, 30);
          }

          // Правая стена (x: 876..900)
          for (let y = 0; y < gd.height; y += 32) {
            ctx.fillStyle = (Math.floor(y / 32)) % 2 === 0 ? '#1e1e2b' : '#161622';
            ctx.fillRect(gd.width - wT, y, wT, 32);
            ctx.strokeStyle = '#0d0d14';
            ctx.strokeRect(gd.width - wT, y, wT, 32);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.fillRect(gd.width - wT + 1, y + 1, 2, 30);
          }

          // Светящиеся энергоканалы плазмы в стенах
          const wallGlow = Math.sin(gd.animTick * 0.08) * 0.25 + 0.75;
          ctx.strokeStyle = `rgba(168, 85, 247, ${wallGlow * 0.85})`;
          ctx.lineWidth = 2.5;
          ctx.shadowColor = '#a855f7';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.moveTo(cornerCut, wT - 1);
          ctx.lineTo(gd.width - cornerCut, wT - 1);
          ctx.moveTo(cornerCut, gd.height - wT + 1);
          ctx.lineTo(gd.width - cornerCut, gd.height - wT + 1);
          ctx.stroke();
          ctx.shadowBlur = 0;

          // 4 УГЛОВЫХ БАСТИОНА (СКОСЫ) С ПЛАЗМЕННЫМИ ЖАРОВНЯМИ
          const bastions = [
            { poly: [[0, 0], [cornerCut, 0], [0, cornerCut]], bx: 36, by: 36 },
            { poly: [[gd.width, 0], [gd.width - cornerCut, 0], [gd.width, cornerCut]], bx: gd.width - 36, by: 36 },
            { poly: [[0, gd.height], [cornerCut, gd.height], [0, gd.height - cornerCut]], bx: 36, by: gd.height - 36 },
            { poly: [[gd.width, gd.height], [gd.width - cornerCut, gd.height], [gd.width, gd.height - cornerCut]], bx: gd.width - 36, by: gd.height - 36 },
          ];

          for (const bas of bastions) {
            // Массивный каменный блок бастиона
            ctx.fillStyle = '#14141e';
            ctx.strokeStyle = '#2b2b3d';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(bas.poly[0][0], bas.poly[0][1]);
            ctx.lineTo(bas.poly[1][0], bas.poly[1][1]);
            ctx.lineTo(bas.poly[2][0], bas.poly[2][1]);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Скошенная грань бастиона
            ctx.strokeStyle = '#3e3e56';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(bas.poly[1][0], bas.poly[1][1]);
            ctx.lineTo(bas.poly[2][0], bas.poly[2][1]);
            ctx.stroke();

            // Каменная чаша жаровни
            ctx.fillStyle = '#0a0a10';
            ctx.strokeStyle = '#581c87';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(bas.bx, bas.by, 13, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Пламя фиолетовой плазмы в жаровне
            const flameG = ctx.createRadialGradient(bas.bx, bas.by, 0, bas.bx, bas.by, 12);
            flameG.addColorStop(0, '#ffffff');
            flameG.addColorStop(0.35, '#c084fc');
            flameG.addColorStop(0.75, '#7e22ce');
            flameG.addColorStop(1, 'rgba(126, 34, 206, 0)');
            ctx.fillStyle = flameG;
            ctx.beginPath();
            ctx.arc(bas.bx, bas.by, 12 + Math.sin(gd.animTick * 0.16 + bas.bx) * 2, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.restore();

          // Отрисовка частиц: аккуратные искры со шлейфом и пламя (высокий FPS без лагов)
          for (const p of gd.particles) {
            const alpha = Math.max(0.08, p.life / p.maxLife);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;

            if (p.isSpark) {
              ctx.strokeStyle = p.color;
              ctx.lineWidth = Math.max(1, p.size * alpha);
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(p.x - p.dx * 1.8, p.y - p.dy * 1.8);
              ctx.stroke();
            } else if (p.isFlame) {
              ctx.beginPath();
              ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * alpha), 0, Math.PI * 2);
              ctx.fill();
            } else if (p.isCloud) {
              ctx.globalAlpha = alpha * 0.4;
              ctx.beginPath();
              ctx.arc(p.x, p.y, p.size * 1.2, 0, Math.PI * 2);
              ctx.fill();
            } else {
              ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
            }
            ctx.restore();
          }

          // Таранный щит игрока
          if (gd.isRamming) {
            ctx.save();
            const pulseCol = (gd.animTick >> 2) % 2 === 0 ? '#ff007f' : '#ff69b4';
            ctx.strokeStyle = pulseCol;
            ctx.lineWidth = 3.5;
            ctx.shadowColor = '#ff007f';
            ctx.shadowBlur = 12;

            ctx.beginPath();
            ctx.arc(gd.player.x, gd.player.y, 28, 0, Math.PI * 2);
            ctx.stroke();

            const spin = gd.animTick * 0.18;
            for (let a = 0; a < 6; a++) {
              const ang = spin + (a * Math.PI) / 3;
              const px = gd.player.x + Math.cos(ang) * 31;
              const py = gd.player.y + Math.sin(ang) * 31;
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.arc(px, py, 2.5, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }

          // Игрок (с мерцанием во время неуязвимости)
          const ps = gd.player.size;
          const pulse = Math.sin(gd.animTick * 0.16) * 3;
          const isInvulnerable = gd.invulnerabilityTimer > 0;
          const strobeVisible = !isInvulnerable || (Math.floor(gd.animTick / 4) % 2 === 0);

          if (strobeVisible) {
            ctx.save();
            ctx.strokeStyle = isInvulnerable ? '#38bdf8' : '#e879f9';
            ctx.lineWidth = 2.5;
            ctx.shadowColor = isInvulnerable ? '#38bdf8' : '#c084fc';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(gd.player.x, gd.player.y - (ps + 4 + pulse));
            ctx.lineTo(gd.player.x + (ps + 4 + pulse), gd.player.y);
            ctx.lineTo(gd.player.x, gd.player.y + (ps + 4 + pulse));
            ctx.lineTo(gd.player.x - (ps + 4 + pulse), gd.player.y);
            ctx.closePath();
            ctx.stroke();

            const plasmaGrad = ctx.createLinearGradient(
              gd.player.x - ps + Math.sin(gd.animTick * 0.1) * 8,
              gd.player.y - ps + Math.cos(gd.animTick * 0.1) * 8,
              gd.player.x + ps,
              gd.player.y + ps
            );
            const tColor1 = (gd.animTick >> 2) % 2 === 0 ? '#c084fc' : '#e879f9';
            const tColor2 = (gd.animTick >> 3) % 2 === 0 ? '#38bdf8' : '#a855f7';
            plasmaGrad.addColorStop(0, tColor1);
            plasmaGrad.addColorStop(0.5, tColor2);
            plasmaGrad.addColorStop(1, '#f43f5e');

            ctx.fillStyle = plasmaGrad;
            ctx.strokeStyle = '#f3e8ff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(gd.player.x, gd.player.y - ps);
            ctx.lineTo(gd.player.x + ps, gd.player.y);
            ctx.lineTo(gd.player.x, gd.player.y + ps);
            ctx.lineTo(gd.player.x - ps, gd.player.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.moveTo(gd.player.x, gd.player.y - ps * 0.4);
            ctx.lineTo(gd.player.x + ps * 0.4, gd.player.y);
            ctx.lineTo(gd.player.x, gd.player.y + ps * 0.4);
            ctx.lineTo(gd.player.x - ps * 0.4, gd.player.y);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }

          // Лазер игрока
          if (gd.rightClicked && gd.activeLaser) {
            const length = 1500;
            const lx2 = gd.player.x + Math.cos(gd.laserAngle) * length;
            const ly2 = gd.player.y + Math.sin(gd.laserAngle) * length;
            const dirX = Math.cos(gd.laserAngle);
            const dirY = Math.sin(gd.laserAngle);
            const perpX = -dirY;
            const perpY = dirX;

            ctx.save();
            ctx.lineCap = 'round';

            ctx.strokeStyle = 'rgba(216, 121, 249, 0.22)';
            ctx.lineWidth = 64;
            ctx.beginPath();
            ctx.moveTo(gd.player.x, gd.player.y);
            ctx.lineTo(lx2, ly2);
            ctx.stroke();

            ctx.strokeStyle = '#e879f9';
            ctx.lineWidth = 22;
            ctx.shadowColor = '#e879f9';
            ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.moveTo(gd.player.x, gd.player.y);
            ctx.lineTo(lx2, ly2);
            ctx.stroke();

            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 10;
            ctx.beginPath();
            ctx.moveTo(gd.player.x, gd.player.y);
            ctx.lineTo(lx2, ly2);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            const segments = 24;
            for (let s = 0; s <= segments; s++) {
              const d = (s / segments) * 600;
              const wave = Math.sin(s * 1.5 - gd.animTick * 0.4) * 7;
              const px = gd.player.x + dirX * d + perpX * wave;
              const py = gd.player.y + dirY * d + perpY * wave;
              if (s === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.stroke();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 4.5;
            ctx.beginPath();
            ctx.moveTo(gd.player.x, gd.player.y);
            ctx.lineTo(lx2, ly2);
            ctx.stroke();

            const originX = gd.player.x + dirX * 10;
            const originY = gd.player.y + dirY * 10;

            ctx.strokeStyle = '#f43f5e';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(originX - perpX * 24, originY - perpY * 24);
            ctx.lineTo(originX + perpX * 24, originY + perpY * 24);
            ctx.stroke();

            const radMuzzle = ctx.createRadialGradient(originX, originY, 2, originX, originY, 26);
            radMuzzle.addColorStop(0, '#ffffff');
            radMuzzle.addColorStop(0.3, '#38bdf8');
            radMuzzle.addColorStop(0.7, '#e879f9');
            radMuzzle.addColorStop(1, 'rgba(232, 121, 249, 0)');
            ctx.fillStyle = radMuzzle;
            ctx.beginPath();
            ctx.arc(originX, originY, 26, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }

          // Летящие лазеры и вражеские снаряды
          for (const fl of gd.flyingLasers) {
            ctx.save();
            ctx.lineCap = 'round';

            if (fl.isBoss && fl.angle !== undefined) {
              const length = 1500;
              const lx2 = fl.x + Math.cos(fl.angle) * length;
              const ly2 = fl.y + Math.sin(fl.angle) * length;
              const dirX = Math.cos(fl.angle);
              const dirY = Math.sin(fl.angle);
              const perpX = -dirY;
              const perpY = dirX;

              ctx.strokeStyle = 'rgba(239, 68, 68, 0.28)';
              ctx.lineWidth = 72;
              ctx.beginPath();
              ctx.moveTo(fl.x, fl.y);
              ctx.lineTo(lx2, ly2);
              ctx.stroke();

              ctx.strokeStyle = '#ef4444';
              ctx.lineWidth = 26;
              ctx.shadowColor = '#ef4444';
              ctx.shadowBlur = 24;
              ctx.beginPath();
              ctx.moveTo(fl.x, fl.y);
              ctx.lineTo(lx2, ly2);
              ctx.stroke();

              ctx.strokeStyle = '#f97316';
              ctx.lineWidth = 14;
              ctx.beginPath();
              ctx.moveTo(fl.x, fl.y);
              ctx.lineTo(lx2, ly2);
              ctx.stroke();

              ctx.strokeStyle = '#fef08a';
              ctx.lineWidth = 3;
              ctx.beginPath();
              for (let s = 0; s <= 24; s++) {
                const d = (s / 24) * 700;
                const wave = Math.sin(s * 1.6 + gd.animTick * 0.5) * 9;
                const px = fl.x + dirX * d + perpX * wave;
                const py = fl.y + dirY * d + perpY * wave;
                if (s === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
              }
              ctx.stroke();

              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 6;
              ctx.beginPath();
              ctx.moveTo(fl.x, fl.y);
              ctx.lineTo(lx2, ly2);
              ctx.stroke();
            } else if (fl.isEnemyBolt) {
              const bCol = fl.color || '#ef4444';
              ctx.fillStyle = bCol;
              ctx.shadowColor = bCol;
              ctx.shadowBlur = 10;
              ctx.beginPath();
              ctx.arc(fl.x, fl.y, 5, 0, Math.PI * 2);
              ctx.fill();

              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.arc(fl.x, fl.y, 2, 0, Math.PI * 2);
              ctx.fill();
            } else {
              ctx.strokeStyle = '#e879f9';
              ctx.lineWidth = 16;
              ctx.shadowColor = '#e879f9';
              ctx.shadowBlur = 12;
              const angle = Math.atan2(fl.dy, fl.dx);
              const lx2 = fl.x + Math.cos(angle) * 1500;
              const ly2 = fl.y + Math.sin(angle) * 1500;
              ctx.beginPath();
              ctx.moveTo(fl.x, fl.y);
              ctx.lineTo(lx2, ly2);
              ctx.stroke();
            }
            ctx.restore();
          }

          // Отрисовка всех боссов
          for (const boss of gd.bosses) {
            const bx = boss.x;
            const by = boss.y;

            ctx.save();
            ctx.strokeStyle = boss.color;
            ctx.lineWidth = 3.5;
            ctx.shadowColor = boss.color;
            ctx.shadowBlur = 14;
            ctx.strokeRect(bx - boss.size, by - boss.size, boss.size * 2, boss.size * 2);

            ctx.fillStyle = '#4a0808';
            ctx.strokeStyle = '#fca5a5';
            ctx.lineWidth = 2;
            ctx.fillRect(bx - (boss.size - 6), by - (boss.size - 6), (boss.size - 6) * 2, (boss.size - 6) * 2);
            ctx.strokeRect(bx - (boss.size - 6), by - (boss.size - 6), (boss.size - 6) * 2, (boss.size - 6) * 2);

            const bossCoreGrad = ctx.createRadialGradient(bx, by, 2, bx, by, 16);
            bossCoreGrad.addColorStop(0, '#ffffff');
            bossCoreGrad.addColorStop(0.3, boss.color === '#a855f7' ? '#c084fc' : '#f97316');
            bossCoreGrad.addColorStop(1, boss.color);
            ctx.fillStyle = bossCoreGrad;
            ctx.fillRect(bx - 14, by - 14, 28, 28);

            // Барьер мега-босса
            if (boss.isBarrierBoss && boss.barrierAngle !== undefined) {
              ctx.save();
              ctx.strokeStyle = '#38bdf8';
              ctx.lineWidth = 5;
              ctx.shadowColor = '#38bdf8';
              ctx.shadowBlur = 14;
              ctx.beginPath();
              ctx.arc(bx, by, boss.size + 14, boss.barrierAngle - 0.9, boss.barrierAngle + 0.9);
              ctx.stroke();

              const bTipX = bx + Math.cos(boss.barrierAngle + 0.9) * (boss.size + 14);
              const bTipY = by + Math.sin(boss.barrierAngle + 0.9) * (boss.size + 14);
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.arc(bTipX, bTipY, 3, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }

            if (boss.isWarning) {
              const lx2 = bx + Math.cos(boss.currentAimAngle) * 1500;
              const ly2 = by + Math.sin(boss.currentAimAngle) * 1500;
              ctx.setLineDash([7, 5]);
              ctx.strokeStyle = boss.color;
              ctx.lineWidth = 2.5;
              ctx.shadowColor = boss.color;
              ctx.shadowBlur = 8;
              ctx.beginPath();
              ctx.moveTo(bx, by);
              ctx.lineTo(lx2, ly2);
              ctx.stroke();
            }
            ctx.restore();
          }

          // Отрисовка врагов (Элитный квадратик теперь ТОЖЕ КРАСНЫЙ с мощной плазмой!)
          for (const en of gd.enemies) {
            const ePulse = Math.sin(gd.animTick * 0.2 + en.offset) * 2;

            ctx.save();
            if (en.isEliteQuad) {
              // --- КРАСНЫЙ ЭЛИТНЫЙ КВАДРАТИК С БУРЛЯЩЕЙ ПЛАЗМОЙ ---
              if (en.isRamming) {
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 3.5;
                ctx.shadowColor = '#ef4444';
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(en.x, en.y, 20, 0, Math.PI * 2);
                ctx.stroke();
              }

              // Внешний контур
              ctx.strokeStyle = '#f87171';
              ctx.lineWidth = 2.2;
              ctx.shadowColor = '#ef4444';
              ctx.shadowBlur = 10;
              ctx.strokeRect(en.x - 9 - ePulse, en.y - 9 - ePulse, 18 + ePulse * 2, 18 + ePulse * 2);

              // ПЛАЗМА ВНУТРИ: переливающийся темно-багровый, алый и солнечный янтарь
              const eliteGrad = ctx.createLinearGradient(
                en.x - 7 + Math.sin(gd.animTick * 0.2) * 5,
                en.y - 7,
                en.x + 7,
                en.y + 7
              );
              eliteGrad.addColorStop(0, '#450a0a');
              eliteGrad.addColorStop(0.5, '#dc2626');
              eliteGrad.addColorStop(1, '#f97316');
              ctx.fillStyle = eliteGrad;
              ctx.fillRect(en.x - 7, en.y - 7, 14, 14);

              // Раскаленное ядро
              ctx.fillStyle = '#fef08a';
              ctx.shadowColor = '#fef08a';
              ctx.shadowBlur = 8;
              ctx.fillRect(en.x - 3, en.y - 3, 6, 6);
            } else {
              // Рядовой дрон
              ctx.strokeStyle = '#ef4444';
              ctx.lineWidth = 1.8;
              ctx.shadowColor = '#ef4444';
              ctx.shadowBlur = 6;
              ctx.strokeRect(en.x - 11 - ePulse, en.y - 11 - ePulse, 22 + ePulse * 2, 22 + ePulse * 2);

              const enGrad = ctx.createLinearGradient(
                en.x - 9 + Math.sin(gd.animTick * 0.15 + en.offset) * 6,
                en.y - 9,
                en.x + 9,
                en.y + 9
              );
              enGrad.addColorStop(0, '#dc2626');
              enGrad.addColorStop(0.5, '#f97316');
              enGrad.addColorStop(1, '#b91c1c');

              ctx.fillStyle = enGrad;
              ctx.fillRect(en.x - 9, en.y - 9, 18, 18);

              ctx.fillStyle = '#fef08a';
              ctx.shadowColor = '#fef08a';
              ctx.shadowBlur = 6;
              ctx.fillRect(en.x - 4, en.y - 4, 8, 8);
            }
            ctx.restore();
          }

          // Прицел
          ctx.strokeStyle = '#a855f7';
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(gd.player.x, gd.player.y);
          ctx.lineTo(gd.mouse.x, gd.mouse.y);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.strokeStyle = '#e879f9';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(gd.mouse.x, gd.mouse.y, 8, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.restore();
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [gameState, showTutorial, spawnEnemy, playSfx, createEnemyDeathExplosion, createPlayerDamageLightning, damagePlayer]);

  return (
    <div className="flex flex-col items-center select-none" ref={containerRef}>
      {/* ИГРОВОЙ HUD (900x50) */}
      <div className="w-[900px] h-[50px] bg-[#121218] border-b-2 border-[#2a2a38] flex items-center justify-between px-4 z-20">
        <div className="flex items-center gap-6">
          <div className="text-[#f3e8ff] font-mono font-bold text-sm tracking-wider flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse"></span>
            LEVEL: {currentLevel}
          </div>

          <div className="flex items-center gap-1.5 text-[#d8b4fe] font-mono text-xs font-bold">
            <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
            <span className="tracking-wide">LIVES:</span>
            <div className="flex gap-1 ml-1">
              {[1, 2, 3].map(i => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-sm transition-all duration-300 ${
                    i <= lives ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]' : 'bg-rose-950 border border-rose-900/50'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#ff007f]" />
            <div className="w-[110px] h-3 bg-[#1c1c28] border border-[#3a3a4f] rounded-xs overflow-hidden p-[1px]">
              <div
                className={`h-full transition-all duration-75 ${
                  ramStamina < 15 ? 'bg-amber-500' : 'bg-gradient-to-r from-[#ff007f] to-[#ff69b4]'
                }`}
                style={{ width: `${ramStamina}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-pink-300 w-7">{Math.round(ramStamina)}%</span>
          </div>

          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#a855f7]" />
            <div className="w-[110px] h-3 bg-[#1c1c28] border border-[#3a3a4f] rounded-xs overflow-hidden p-[1px]">
              <div
                className={`h-full transition-all duration-75 ${
                  laserStamina < 15 ? 'bg-amber-500' : 'bg-gradient-to-r from-[#8b5cf6] to-[#c084fc]'
                }`}
                style={{ width: `${laserStamina}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-purple-300 w-7">{Math.round(laserStamina)}%</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {gameState === 'PLAYING' && (
            <div className="text-xs font-mono text-zinc-400">
              ВРАГИ: <span className="text-rose-400 font-bold">{enemiesLeft}</span>
            </div>
          )}

          <button
            onClick={() => setIsMuted(!isMuted)}
            className="text-zinc-400 hover:text-white transition-colors p-1 cursor-pointer"
            title={isMuted ? 'Включить звук' : 'Выключить звук'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-purple-400" />}
          </button>

          {gameState === 'PLAYING' && (
            <button
              onClick={togglePause}
              className="px-2.5 py-1 text-xs font-mono bg-[#1e1b4b] hover:bg-[#2e2b6b] text-[#d8b4fe] border border-[#7c3aed] rounded-sm transition-all cursor-pointer"
            >
              ESC / ПАУЗА
            </button>
          )}

          {gameState !== 'MENU' && (
            <button
              onClick={() => {
                if (audioRef.current) {
                  audioRef.current.pause();
                  audioRef.current.currentTime = 0;
                }
                setGameState('MENU');
              }}
              className="text-xs font-mono text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> В МЕНЮ
            </button>
          )}
        </div>
      </div>

      {/* ИГРОВОЕ ОКНО АРЕНЫ (900x650) */}
      <div className="relative w-[900px] h-[650px] overflow-hidden bg-[#050508] border-x-2 border-b-2 border-[#2a2a38] shadow-[0_0_40px_rgba(0,0,0,0.95)]">
        {/* Слой WebGL освещения */}
        <canvas
          ref={webglCanvasRef}
          width={900}
          height={650}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {/* 2D Canvas */}
        <canvas
          ref={gameCanvasRef}
          width={900}
          height={650}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onContextMenu={e => e.preventDefault()}
          className="absolute inset-0 w-full h-full cursor-crosshair z-10"
        />

        {/* ПОЛОСЫ ЗДОРОВЬЯ ВСЕХ АКТИВНЫХ БОССОВ */}
        {bossesList.length > 0 && gameState === 'PLAYING' && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 pointer-events-none">
            {bossesList.map((b, idx) => (
              <div key={idx} className="flex flex-col items-center">
                <div
                  className="text-[10px] font-mono font-bold tracking-widest drop-shadow-[0_0_4px_#ef4444]"
                  style={{ color: b.color }}
                >
                  {b.name}
                </div>
                <div className="w-[280px] h-2 bg-[#181824] border border-[#7f1d1d] p-[1px] rounded-xs shadow-[0_0_8px_rgba(239,68,68,0.3)]">
                  <div
                    className="h-full transition-all duration-75"
                    style={{
                      width: `${(b.hp / b.maxHp) * 100}%`,
                      backgroundColor: b.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ЭКРАН 1: ГЛАВНОЕ МЕНЮ С КАМЕННЫМ МОНОЛИТОМ И ТРЕЩИНАМИ ФИОЛЕТОВОЙ ПЛАЗМЫ */}
        {gameState === 'MENU' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-30 pointer-events-auto">
            {/* МОНУМЕНТАЛЬНЫЙ КАМЕННЫЙ ЗАГОЛОВОК С ТРЕЩИНАМИ ФИОЛЕТОВОЙ ПЛАЗМЫ */}
            <div className="text-center mb-9 relative select-none">
              <div className="relative inline-block w-[640px] h-[95px]">
                <svg
                  className="w-full h-full overflow-visible drop-shadow-[0_12px_24px_rgba(0,0,0,0.95)]"
                  viewBox="0 0 640 95"
                >
                  <defs>
                    {/* Процедурная текстура гранита и базальтового камня */}
                    <filter id="stoneTextureFilter" x="-10%" y="-10%" width="120%" height="120%">
                      <feTurbulence type="fractalNoise" baseFrequency="0.045 0.08" numOctaves="4" result="noise" />
                      <feDiffuseLighting in="noise" lightingColor="#d0d0e6" surfaceScale="2.8" diffuseConstant="1.3" result="light">
                        <feDistantLight azimuth="225" elevation="52" />
                      </feDiffuseLighting>
                      <feColorMatrix
                        type="matrix"
                        values="
                          0.22 0 0 0 0.12
                          0 0.22 0 0 0.12
                          0 0 0.28 0 0.17
                          0 0 0 1 0"
                        in="noise"
                        result="basaltColor"
                      />
                      <feBlend mode="multiply" in="basaltColor" in2="light" result="stoneSurface" />
                      <feComposite operator="in" in="stoneSurface" in2="SourceGraphic" result="texturedText" />
                      <feDropShadow dx="0" dy="7" stdDeviation="5" floodColor="#000000" floodOpacity="0.95" result="shadow" />
                      <feMerge>
                        <feMergeNode in="shadow" />
                        <feMergeNode in="texturedText" />
                      </feMerge>
                    </filter>

                    {/* Фильтр свечения фиолетовой плазмы */}
                    <filter id="violetPlasmaFilter" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="4.5" result="blurWide" />
                      <feGaussianBlur stdDeviation="1.5" result="blurTight" />
                      <feMerge>
                        <feMergeNode in="blurWide" />
                        <feMergeNode in="blurTight" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>

                    {/* Градиент раскаленной плазмы */}
                    <linearGradient id="violetMagmaGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#7e22ce" />
                      <stop offset="25%" stopColor="#a855f7" />
                      <stop offset="50%" stopColor="#e879f9" />
                      <stop offset="75%" stopColor="#c084fc" />
                      <stop offset="100%" stopColor="#9333ea" />
                    </linearGradient>
                  </defs>

                  {/* 1. Массивный базальтовый текст с каменной текстурой */}
                  <text
                    x="320"
                    y="65"
                    textAnchor="middle"
                    fontFamily="monospace"
                    fontWeight="900"
                    fontSize="58"
                    letterSpacing="10"
                    fill="#28283a"
                    stroke="#484862"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                    filter="url(#stoneTextureFilter)"
                  >
                    ABYSSAL ECHO
                  </text>

                  {/* 2. Верхняя фаска света на каменных буквах */}
                  <text
                    x="320"
                    y="63.5"
                    textAnchor="middle"
                    fontFamily="monospace"
                    fontWeight="900"
                    fontSize="58"
                    letterSpacing="10"
                    fill="none"
                    stroke="#6e6e8e"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  >
                    ABYSSAL ECHO
                  </text>

                  {/* 3. Кристаллические ветвящиеся трещины фиолетовой плазмы */}
                  <g filter="url(#violetPlasmaFilter)">
                    {/* Слой глубокого плазменного свечения (A-B-Y, S-S-A-L, E-C-H-O) */}
                    <path
                      d="M 32 68 L 44 42 L 58 52 L 72 32 L 86 54 L 98 40 L 112 60 L 128 36 L 144 58 M 58 52 L 64 74 M 86 54 L 90 75 M 128 36 L 134 20"
                      fill="none"
                      stroke="#7e22ce"
                      strokeWidth="5"
                      opacity="0.75"
                    />
                    <path
                      d="M 172 34 L 186 58 L 202 38 L 220 56 L 238 32 L 254 54 L 272 38 L 290 62 L 310 40 L 332 58 L 350 44 M 186 58 L 194 76 M 238 32 L 244 18 M 290 62 L 298 76 M 332 58 L 340 74"
                      fill="none"
                      stroke="#7e22ce"
                      strokeWidth="5"
                      opacity="0.75"
                    />
                    <path
                      d="M 420 36 L 436 60 L 452 42 L 474 58 L 492 34 L 512 56 L 530 38 L 552 62 L 574 40 L 596 58 L 612 46 M 436 60 L 444 76 M 492 34 L 498 18 M 552 62 L 560 76 M 596 58 L 604 74"
                      fill="none"
                      stroke="#7e22ce"
                      strokeWidth="5"
                      opacity="0.75"
                    />

                    {/* Средний раскаленный слой фиолетовой плазмы */}
                    <path
                      d="M 32 68 L 44 42 L 58 52 L 72 32 L 86 54 L 98 40 L 112 60 L 128 36 L 144 58 M 58 52 L 64 74 M 86 54 L 90 75 M 128 36 L 134 20"
                      fill="none"
                      stroke="url(#violetMagmaGrad)"
                      strokeWidth="2.2"
                      opacity="0.95"
                    />
                    <path
                      d="M 172 34 L 186 58 L 202 38 L 220 56 L 238 32 L 254 54 L 272 38 L 290 62 L 310 40 L 332 58 L 350 44 M 186 58 L 194 76 M 238 32 L 244 18 M 290 62 L 298 76 M 332 58 L 340 74"
                      fill="none"
                      stroke="url(#violetMagmaGrad)"
                      strokeWidth="2.2"
                      opacity="0.95"
                    />
                    <path
                      d="M 420 36 L 436 60 L 452 42 L 474 58 L 492 34 L 512 56 L 530 38 L 552 62 L 574 40 L 596 58 L 612 46 M 436 60 L 444 76 M 492 34 L 498 18 M 552 62 L 560 76 M 596 58 L 604 74"
                      fill="none"
                      stroke="url(#violetMagmaGrad)"
                      strokeWidth="2.2"
                      opacity="0.95"
                    />

                    {/* Бело-лавандовое раскаленное ядро трещин */}
                    <path
                      d="M 32 68 L 44 42 L 58 52 L 72 32 L 86 54 L 98 40 L 112 60 L 128 36 L 144 58 M 58 52 L 64 74 M 86 54 L 90 75 M 128 36 L 134 20"
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="0.9"
                      opacity="0.95"
                    />
                    <path
                      d="M 172 34 L 186 58 L 202 38 L 220 56 L 238 32 L 254 54 L 272 38 L 290 62 L 310 40 L 332 58 L 350 44 M 186 58 L 194 76 M 238 32 L 244 18 M 290 62 L 298 76 M 332 58 L 340 74"
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="0.9"
                      opacity="0.95"
                    />
                    <path
                      d="M 420 36 L 436 60 L 452 42 L 474 58 L 492 34 L 512 56 L 530 38 L 552 62 L 574 40 L 596 58 L 612 46 M 436 60 L 444 76 M 492 34 L 498 18 M 552 62 L 560 76 M 596 58 L 604 74"
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="0.9"
                      opacity="0.95"
                    />
                  </g>
                </svg>

                {/* Подзаголовок-табличка из камня */}
                <div className="flex items-center justify-center gap-2 mt-1">
                  <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-[#a855f7]/60" />
                  <span className="text-[11px] font-mono tracking-[0.25em] text-[#a855f7] uppercase font-bold drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]">
                    PLASMA COMBAT ARENA
                  </span>
                  <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-[#a855f7]/60" />
                </div>
              </div>
            </div>

            {/* КНОПКИ УРОВНЕЙ В КАМЕННОМ СТИЛЕ С ТРЕЩИНАМИ ФИОЛЕТОВОЙ ПЛАЗМЫ */}
            <div className="flex flex-col gap-4 w-[340px] relative z-10">
              {[
                { lvl: 1, name: 'LEVEL 1', roman: 'I', desc: '15 Врагов • Разминка на Арене' },
                { lvl: 2, name: 'LEVEL 2', roman: 'II', desc: '40 Врагов • Битва с Титаном' },
                { lvl: 3, name: 'LEVEL 3', roman: 'III', desc: '55 Врагов • 3 Босса + Элита' },
              ].map(item => (
                <button
                  key={item.lvl}
                  onClick={() => startLevel(item.lvl)}
                  className="group relative h-[74px] rounded-lg p-0.5 overflow-hidden transition-all duration-300 hover:scale-[1.02] cursor-pointer"
                >
                  {/* Фоновая каменная плита-монолит */}
                  <div className="w-full h-full bg-[#111119] border-2 border-[#2c2c3e] group-hover:border-[#a855f7] rounded-lg flex items-center justify-between px-5 relative overflow-hidden transition-all duration-300 group-hover:shadow-[0_0_25px_rgba(168,85,247,0.35)]">
                    {/* Гранитная микротекстура сколотого камня */}
                    <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:10px_10px] pointer-events-none" />

                    {/* Высеченные светящиеся трещины фиолетовой плазмы на плите */}
                    <svg
                      className="absolute inset-0 w-full h-full pointer-events-none opacity-60 group-hover:opacity-100 transition-opacity duration-300"
                      viewBox="0 0 340 74"
                      preserveAspectRatio="none"
                    >
                      <g filter="drop-shadow(0 0 5px #a855f7)">
                        <path
                          d="M 8 36 L 46 48 L 92 26 L 146 46 L 216 20 L 278 52 L 328 32"
                          fill="none"
                          stroke="#7e22ce"
                          strokeWidth="3.2"
                        />
                        <path
                          d="M 8 36 L 46 48 L 92 26 L 146 46 L 216 20 L 278 52 L 328 32"
                          fill="none"
                          stroke="#c084fc"
                          strokeWidth="1.6"
                        />
                        <path
                          d="M 92 26 L 106 8 M 146 46 L 160 66 M 216 20 L 236 6 M 278 52 L 292 68"
                          fill="none"
                          stroke="#f3e8ff"
                          strokeWidth="1"
                        />
                      </g>
                    </svg>

                    {/* Римская цифра и текст уровня */}
                    <div className="relative z-10 flex items-center gap-3.5 text-left">
                      <div className="w-9 h-9 rounded-md bg-[#181824] border border-[#3b3b52] group-hover:border-[#c084fc] flex items-center justify-center font-mono font-black text-sm text-[#c084fc] group-hover:text-white group-hover:shadow-[0_0_12px_#a855f7] transition-all">
                        {item.roman}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-mono font-black text-lg text-zinc-100 group-hover:text-white tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                          {item.name}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400 group-hover:text-purple-300">
                          {item.desc}
                        </span>
                      </div>
                    </div>

                    <div className="relative z-10 w-7 h-7 rounded-full bg-[#1a1a26] group-hover:bg-[#581c87] border border-[#3a3a52] group-hover:border-[#c084fc] flex items-center justify-center transition-all group-hover:shadow-[0_0_10px_#a855f7]">
                      <span className="text-zinc-400 group-hover:text-white text-xs font-bold">→</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ЭКРАН 2: РУКОВОДСТВО */}
        {showTutorial && gameState === 'PLAYING' && (
          <div className="absolute inset-0 bg-[#050508]/85 backdrop-blur-xs flex items-center justify-center z-40">
            <div className="w-[560px] bg-[#0f0f1a] border-2 border-[#c084fc] rounded-lg p-7 shadow-[0_0_30px_rgba(192,132,252,0.3)]">
              <div className="text-center mb-6">
                <div className="text-xs font-mono text-purple-400 uppercase tracking-widest mb-1">Руководство пилота</div>
                <h2 className="text-2xl font-bold font-mono text-[#f3e8ff] tracking-wider">FLIGHT MANUAL</h2>
              </div>

              <div className="space-y-4 font-mono text-sm mb-7">
                <div className="flex items-start gap-3 bg-purple-950/20 p-3 rounded-sm border border-purple-900/30">
                  <span className="text-purple-400 font-bold">• КУРСОР:</span>
                  <span className="text-[#d8b4fe] text-xs">Направление тяги и скорость полета (дальше мышь — быстрее).</span>
                </div>
                <div className="flex items-start gap-3 bg-fuchsia-950/20 p-3 rounded-sm border border-fuchsia-900/30">
                  <span className="text-fuchsia-400 font-bold">• ПРАВЫЙ КЛИК:</span>
                  <span className="text-[#d8b4fe] text-xs">Зажать для наводящегося плазменного луча / отпустить для выстрела сгустком.</span>
                </div>
                <div className="flex items-start gap-3 bg-pink-950/20 p-3 rounded-sm border border-pink-900/30">
                  <span className="text-pink-400 font-bold">• ПРОБЕЛ:</span>
                  <span className="text-[#ff69b4] text-xs">Таранный силовой щит. Ускоряет на 40%, отражает вражеские выстрелы и распыляет врагов!</span>
                </div>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={() => setShowTutorial(false)}
                  className="px-8 py-3 bg-[#1e1b4b] hover:bg-[#2e2b6b] border-2 border-[#e879f9] text-[#f3e8ff] font-mono font-bold text-sm rounded-md shadow-[0_0_15px_rgba(232,121,249,0.3)] transition-all cursor-pointer"
                >
                  ПОНЯЛ
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ЭКРАН 3: ПАУЗА */}
        {gameState === 'PAUSED' && (
          <div className="absolute inset-0 bg-[#050508]/80 backdrop-blur-xs flex items-center justify-center z-40">
            <div className="w-[320px] bg-[#0f0f1a] border-2 border-[#c084fc] rounded-lg p-6 text-center shadow-[0_0_25px_rgba(192,132,252,0.4)]">
              <h3 className="text-3xl font-black font-mono text-[#f3e8ff] tracking-widest mb-6">PAUSED</h3>
              <div className="flex flex-col gap-3">
                <button
                  onClick={togglePause}
                  className="py-3 bg-[#1e1b4b] hover:bg-[#2e2b6b] border border-[#a855f7] text-[#f3e8ff] font-mono font-bold rounded-sm transition-all cursor-pointer"
                >
                  ПРОДОЛЖИТЬ
                </button>
                <button
                  onClick={() => startLevel(currentLevel)}
                  className="py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 font-mono text-sm rounded-sm transition-all cursor-pointer"
                >
                  ЗАНОВО
                </button>
                <button
                  onClick={() => setGameState('MENU')}
                  className="py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 font-mono text-sm rounded-sm transition-all cursor-pointer"
                >
                  ГЛАВНОЕ МЕНЮ
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ЭКРАН 4: ПОБЕДА */}
        {gameState === 'VICTORY' && (
          <div className="absolute inset-0 bg-[#050508]/85 backdrop-blur-xs flex items-center justify-center z-40">
            <div className="w-[380px] bg-[#0f0f1a] border-2 border-emerald-400 rounded-lg p-7 text-center shadow-[0_0_35px_rgba(52,211,153,0.3)]">
              <h2 className="text-4xl font-black font-mono text-emerald-400 tracking-wider mb-6 drop-shadow-[0_0_12px_#34d399]">
                VICTORY!
              </h2>
              <div className="flex gap-3">
                <button
                  onClick={() => startLevel(currentLevel)}
                  className="flex-1 py-3 bg-[#1e1b4b] hover:bg-[#2e2b6b] border border-[#a855f7] text-[#f3e8ff] font-mono font-bold text-xs rounded-sm transition-all cursor-pointer"
                >
                  ПОВТОРИТЬ
                </button>
                {currentLevel < 3 ? (
                  <button
                    onClick={() => startLevel(currentLevel + 1)}
                    className="flex-1 py-3 bg-emerald-950 hover:bg-emerald-900 border border-emerald-500 text-emerald-200 font-mono font-bold text-xs rounded-sm transition-all cursor-pointer"
                  >
                    NEXT (LVL {currentLevel + 1}) →
                  </button>
                ) : (
                  <button
                    onClick={() => setGameState('MENU')}
                    className="flex-1 py-3 bg-purple-950 hover:bg-purple-900 border border-purple-500 text-purple-200 font-mono font-bold text-xs rounded-sm transition-all cursor-pointer"
                  >
                    MENU
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ЭКРАН 5: ПОРАЖЕНИЕ */}
        {gameState === 'GAMEOVER' && (
          <div className="absolute inset-0 bg-[#050508]/85 backdrop-blur-xs flex items-center justify-center z-40">
            <div className="w-[340px] bg-[#0f0f1a] border-2 border-rose-600 rounded-lg p-7 text-center shadow-[0_0_35px_rgba(244,63,94,0.3)]">
              <h2 className="text-4xl font-black font-mono text-rose-500 tracking-wider mb-6 drop-shadow-[0_0_12px_#f43f5e]">
                GAME OVER
              </h2>
              <div className="flex gap-3">
                <button
                  onClick={() => startLevel(currentLevel)}
                  className="flex-1 py-3 bg-rose-950 hover:bg-rose-900 border border-rose-500 text-rose-200 font-mono font-bold text-xs rounded-sm transition-all cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 inline mr-1" /> RESTART
                </button>
                <button
                  onClick={() => setGameState('MENU')}
                  className="flex-1 py-3 bg-[#1e1b4b] hover:bg-[#2e2b6b] border border-zinc-700 text-zinc-300 font-mono font-bold text-xs rounded-sm transition-all cursor-pointer"
                >
                  MENU
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
