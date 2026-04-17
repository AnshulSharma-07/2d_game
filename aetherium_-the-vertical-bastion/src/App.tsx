/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Matter from 'matter-js';
import { Stage, Layer, Rect, Circle, Group, Text, Line, Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import { Shield, Target, Zap, Play, RotateCcw, Info, Coins, Heart, Swords, Upload, Image as ImageIcon, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

interface Customization {
  enemySkin: 'default' | 'neon' | 'classic' | 'custom';
  baseSkin: 'default' | 'fortress' | 'tech' | 'custom';
  enemyImageUrl: string | null;
  baseImageUrl: string | null;
}

interface GameState {
  score: number;
  money: number;
  health: number;
  wave: number;
  enemiesSpawnedInWave: number;
  enemiesRemainingInWave: number;
  isGameOver: boolean;
  isPaused: boolean;
  playerName: string;
  gameMode: 'infinite' | 'level';
  view: 'home' | 'game' | 'options' | 'highscores' | 'nameEntry';
}

interface TowerData {
  id: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  type: string;
  lastShot: number;
  damageMultiplier: number;
  fireRateMultiplier: number;
  level: number;
}

interface LootData {
  id: string;
  x: number;
  y: number;
  type: 'repair' | 'damage' | 'rate';
}

interface EnemyData {
  id: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  damage: number;
  type: 'blighter' | 'wraith' | 'crusher' | 'voidqueen';
  targetWaypointIndex?: number;
}

interface ProjectileData {
  id: string;
  x: number;
  y: number;
  radius: number;
  damage: number;
}

// --- Constants ---

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 600;
const BASE_X = 100;
const BASE_Y = CANVAS_HEIGHT / 2;
const BASE_WIDTH = 60;
const BASE_HEIGHT = 120;

const FIXED_PATH = [
  { x: CANVAS_WIDTH, y: CANVAS_HEIGHT / 2 },
  { x: 800, y: 150 },
  { x: 600, y: 450 },
  { x: 400, y: 150 },
  { x: 200, y: 450 },
  { x: BASE_X, y: BASE_Y }
];

const TOWER_TYPES: Record<string, any> = {
  basic: { cost: 50, range: 250, cooldown: 1000, color: '#4f46e5', projectileMass: 1, projectileSpeed: 10, label: 'Artillery Deck', maxHealth: 100 },
  heavy: { cost: 120, range: 200, cooldown: 2000, color: '#dc2626', projectileMass: 5, projectileSpeed: 7, label: 'Engineering Bay', maxHealth: 250 },
  sniper: { cost: 150, range: 450, cooldown: 3000, color: '#16a34a', projectileMass: 0.5, projectileSpeed: 20, label: 'Hydroponic Farm', maxHealth: 60 },
};

// --- Background Animation Component ---

const BackgroundAnimation = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let particles: { x: number; y: number; vx: number; vy: number; size: number }[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initParticles();
    };

    const initParticles = () => {
      particles = [];
      const count = Math.floor((canvas.width * canvas.height) / 15000);
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          size: Math.random() * 2 + 1,
        });
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(79, 70, 229, 0.15)';
      
      // Draw Grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.lineWidth = 1;
      const step = 50;
      for (let x = 0; x < canvas.width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Draw Particles
      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        // Connect nearby particles
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
          if (dist < 150) {
            ctx.strokeStyle = `rgba(79, 70, 229, ${0.1 * (1 - dist / 150)})`;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      });

      animationFrameId = requestAnimationFrame(draw);
    };

    window.addEventListener('resize', resize);
    resize();
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />;
};

const ENEMY_TYPES = {
  blighter: { health: 150, speed: 1.5, size: 15, reward: 5, color: '#10b981', dropChance: 0.1, label: 'Spore Blighter' },
  wraith: { health: 80, speed: 3.5, size: 12, reward: 8, color: '#06b6d4', dropChance: 0.05, label: 'Whisper Wraith' },
  crusher: { health: 600, speed: 0.7, size: 28, reward: 20, color: '#8b5cf6', dropChance: 0.3, label: 'Cloud Crusher' },
  voidqueen: { health: 10000, speed: 0.3, size: 65, reward: 300, color: '#f43f5e', dropChance: 1.0, label: 'Void Queen' },
};

// --- Main Component ---

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    money: 200,
    health: 100,
    wave: 1,
    enemiesSpawnedInWave: 0,
    enemiesRemainingInWave: 0,
    isGameOver: false,
    isPaused: true,
    playerName: 'Player',
    gameMode: 'infinite',
    view: 'home',
  });

  const [hasSavedGame, setHasSavedGame] = useState(false);
  const [highScores, setHighScores] = useState<{ score: number; date: string; name: string }[]>([]);
  const [playerNameInput, setPlayerNameInput] = useState('');
  const [previousPlayers, setPreviousPlayers] = useState<string[]>([]);
  const [nameEntryStep, setNameEntryStep] = useState<'name' | 'mode'>('name');
  const [customization, setCustomization] = useState<Customization>({
    enemySkin: 'default',
    baseSkin: 'default',
    enemyImageUrl: null,
    baseImageUrl: null,
  });

  const [enemyImage] = useImage(customization.enemyImageUrl || '');
  const [baseImage] = useImage(customization.baseImageUrl || '');

  const fetchHighScores = async () => {
    try {
      const resp = await fetch('/api/highscores');
      const data = await resp.json();
      setHighScores(data);
    } catch (err) {
      console.error('Failed to fetch high scores:', err);
    }
  };

  const fetchPlayers = async () => {
    try {
      const resp = await fetch('/api/players');
      const data = await resp.json();
      setPreviousPlayers(data);
    } catch (err) {
      console.error('Failed to fetch players:', err);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('physidefend_save');
    setHasSavedGame(!!saved);
    fetchHighScores();
    fetchPlayers();
  }, []);

  const updateHighScores = async (newScore: number) => {
    try {
      await fetch('/api/highscores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: gameState.playerName || 'Anonymous', score: newScore }),
      });
      fetchHighScores();
    } catch (err) {
      console.error('Failed to save high score:', err);
    }
  };

  const saveGame = () => {
    const saveData = {
      gameState,
      towers,
      loots,
      customization,
      // We don't save enemies or projectiles for simplicity in this physics engine
    };
    localStorage.setItem('physidefend_save', JSON.stringify(saveData));
    setHasSavedGame(true);
  };

  const loadGame = () => {
    const saved = localStorage.getItem('physidefend_save');
    if (saved) {
      const data = JSON.parse(saved);
      
      // Clear current physics
      Matter.World.clear(worldRef.current, false);
      enemiesRef.current.clear();
      towersRef.current.clear();
      projectilesRef.current.clear();
      if (baseRef.current) Matter.World.add(worldRef.current, baseRef.current);

      if (data.customization) {
        setCustomization(data.customization);
      }

      // Restore Towers Physics
      data.towers.forEach((t: TowerData) => {
        const body = Matter.Bodies.rectangle(t.x, t.y, 40, 40, {
          isStatic: true,
          label: 'tower',
        });
        // @ts-ignore
        body.towerId = t.id;
        towersRef.current.set(t.id, body);
        Matter.World.add(worldRef.current, body);
      });

      setGameState({ ...data.gameState, view: 'game', isPaused: false });
      setTowers(data.towers);
      setLoots(data.loots);
      setEnemies([]);
      setProjectiles([]);
    }
  };

  const [towers, setTowers] = useState<TowerData[]>([]);
  const [enemies, setEnemies] = useState<EnemyData[]>([]);
  const [projectiles, setProjectiles] = useState<ProjectileData[]>([]);
  const [loots, setLoots] = useState<LootData[]>([]);
  const [selectedTowerType, setSelectedTowerType] = useState<keyof typeof TOWER_TYPES>('basic');
  const [selectedTowerId, setSelectedTowerId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  // Matter.js Refs
  const engineRef = useRef(Matter.Engine.create({ gravity: { x: 0, y: 0 } }));
  const worldRef = useRef(engineRef.current.world);
  const enemiesRef = useRef<Map<string, Matter.Body>>(new Map());
  const towersRef = useRef<Map<string, Matter.Body>>(new Map());
  const projectilesRef = useRef<Map<string, Matter.Body>>(new Map());
  const baseRef = useRef<Matter.Body | null>(null);

  // Game Loop Ref
  const requestRef = useRef<number>(null);

  // Initialize Physics
  useEffect(() => {
    const engine = engineRef.current;
    const world = worldRef.current;

    // Create Base Body
    const base = Matter.Bodies.rectangle(BASE_X, BASE_Y, BASE_WIDTH, BASE_HEIGHT, {
      isStatic: true,
      label: 'base',
    });
    baseRef.current = base;
    Matter.World.add(world, base);

    // Collision Handling
    Matter.Events.on(engine, 'collisionStart', (event) => {
      event.pairs.forEach((pair) => {
        const { bodyA, bodyB } = pair;
        
        // Enemy hits base
        if ((bodyA.label === 'base' && bodyB.label === 'enemy') || 
            (bodyA.label === 'enemy' && bodyB.label === 'base')) {
          const enemyBody = bodyA.label === 'enemy' ? bodyA : bodyB;
          // @ts-ignore
          const enemyId = enemyBody.enemyId;
          if (enemyId) handleEnemyAtBase(enemyId);
        }

        // Enemy hits tower
        if ((bodyA.label === 'tower' && bodyB.label === 'enemy') || 
            (bodyA.label === 'enemy' && bodyB.label === 'tower')) {
          const enemyBody = bodyA.label === 'enemy' ? bodyA : bodyB;
          const towerBody = bodyA.label === 'tower' ? bodyA : bodyB;
          // @ts-ignore
          const enemyId = enemyBody.enemyId;
          // @ts-ignore
          const towerId = towerBody.towerId;
          
          // Towers take damage now
          if (towerId) handleTowerDamage(towerId, 20);
          
          if (enemyId) removeEnemyWithoutBaseDamage(enemyId); // Enemy is destroyed upon hitting tower
        }

        // Projectile hits enemy
        if ((bodyA.label === 'projectile' && bodyB.label === 'enemy') || 
            (bodyA.label === 'enemy' && bodyB.label === 'projectile')) {
          const projectileBody = bodyA.label === 'projectile' ? bodyA : bodyB;
          const enemyBody = bodyA.label === 'enemy' ? bodyA : bodyB;
          
          // @ts-ignore
          const enemyId = enemyBody.enemyId;
          if (enemyId) {
            // @ts-ignore
            const enemyType = enemyBody.enemyType;
            // @ts-ignore
            const towerType = projectileBody.towerType;
            
            // Calculate damage based on momentum and projectile base damage
            const momentum = projectileBody.mass * Matter.Vector.magnitude(projectileBody.velocity);
            // @ts-ignore
            const projectileDamage = projectileBody.projectileDamage || 1;
            
            let finalDamage = momentum * 5 * projectileDamage;
            
            // --- Unique Armor Logic (GDD) ---
            if (enemyType === 'crusher') {
              // Cloud Crushers take 80% reduced damage from non-heavy projectiles
              if (towerType !== 'heavy') {
                finalDamage *= 0.2;
              }
            }
            
            handleEnemyDamage(enemyId, finalDamage);
          }
          
          // Remove projectile on hit
          removeProjectile(projectileBody.id.toString());
        }
      });
    });

    return () => {
      Matter.Engine.clear(engine);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  // Helper functions for physics updates
  const triggerExplosion = (x: number, y: number, radius: number, damage: number) => {
    setTowers(prev => {
      return prev.map(t => {
        const dist = Math.hypot(t.x - x, t.y - y);
        if (dist < radius) {
          const newHealth = Math.max(0, t.health - damage);
          if (newHealth <= 0) {
            removeTowerPhysics(t.id);
            return null;
          }
          return { ...t, health: newHealth };
        }
        return t;
      }).filter((t): t is TowerData => t !== null);
    });
  };

  const removeEnemyWithoutBaseDamage = (id: string) => {
    setEnemies(prev => {
      const enemy = prev.find(e => e.id === id);
      if (enemy) {
        if (enemy.type === 'blighter') {
          triggerExplosion(enemy.x, enemy.y, 150, 40);
        }
        setGameState(gs => ({ 
          ...gs, 
          enemiesRemainingInWave: gs.enemiesRemainingInWave - 1
        }));
        removeEnemyPhysics(id);
      }
      return prev.filter(e => e.id !== id);
    });
  };

  const handleEnemyAtBase = (id: string) => {
    setEnemies(prev => {
      const enemy = prev.find(e => e.id === id);
      if (enemy) {
        // --- Unique Contact Behavior ---
        if (enemy.type === 'blighter') {
          triggerExplosion(enemy.x, enemy.y, 150, 40);
        }

        setGameState(gs => ({ 
          ...gs, 
          health: Math.max(0, gs.health - enemy.damage),
          enemiesRemainingInWave: gs.enemiesRemainingInWave - 1
        }));
        removeEnemyPhysics(id);
      }
      return prev.filter(e => e.id !== id);
    });
  };

  const handleEnemyDamage = (id: string, damage: number) => {
    setEnemies(prev => {
      return prev.map(e => {
        if (e.id === id) {
          const newHealth = e.health - damage;
          if (newHealth <= 0) {
            // --- Unique Death Behavior ---
            if (e.type === 'blighter') {
              triggerExplosion(e.x, e.y, 120, 20);
            }

            setGameState(gs => ({ 
              ...gs, 
              score: gs.score + 100, 
              money: gs.money + ENEMY_TYPES[e.type].reward,
              enemiesRemainingInWave: gs.enemiesRemainingInWave - 1
            }));
            
            // Handle Loot Drop
            const config = ENEMY_TYPES[e.type];
            if (Math.random() < config.dropChance) {
              const body = enemiesRef.current.get(id);
              if (body) {
                const lootTypes: LootData['type'][] = ['repair', 'damage', 'rate'];
                const lootType = lootTypes[Math.floor(Math.random() * lootTypes.length)];
                setLoots(l => [...l, {
                  id: Math.random().toString(36).substr(2, 9),
                  x: body.position.x,
                  y: body.position.y,
                  type: lootType
                }]);
              }
            }

            removeEnemyPhysics(id);
            return null;
          }
          return { ...e, health: newHealth };
        }
        return e;
      }).filter((e): e is EnemyData => e !== null);
    });
  };

  const handleTowerDamage = (id: string, damage: number) => {
    setTowers(prev => {
      return prev.map(t => {
        if (t.id === id) {
          const newHealth = Math.max(0, t.health - damage);
          if (newHealth <= 0) {
            removeTowerPhysics(id);
            return null;
          }
          return { ...t, health: newHealth };
        }
        return t;
      }).filter((t): t is TowerData => t !== null);
    });
  };

  const applyLootEffect = (type: LootData['type']) => {
    if (type === 'repair') {
      setTowers(prev => prev.map(t => ({
        ...t,
        health: Math.min(t.maxHealth, t.health + t.maxHealth * 0.25)
      })));
      setGameState(gs => ({ ...gs, health: Math.min(100, gs.health + 5) }));
    } else if (type === 'damage') {
      setTowers(prev => prev.map(t => ({
        ...t,
        damageMultiplier: t.damageMultiplier + 0.2
      })));
    } else if (type === 'rate') {
      setTowers(prev => prev.map(t => ({
        ...t,
        fireRateMultiplier: t.fireRateMultiplier + 0.1
      })));
    }
  };

  const collectLoot = (id: string) => {
    const loot = loots.find(l => l.id === id);
    if (!loot) return;

    setLoots(prev => prev.filter(l => l.id !== id));
    applyLootEffect(loot.type);
  };

  const removeEnemyPhysics = (id: string) => {
    const body = enemiesRef.current.get(id);
    if (body) {
      Matter.World.remove(worldRef.current, body);
      enemiesRef.current.delete(id);
    }
  };

  const removeTowerPhysics = (id: string) => {
    const body = towersRef.current.get(id);
    if (body) {
      Matter.World.remove(worldRef.current, body);
      towersRef.current.delete(id);
    }
  };

  const removeProjectile = (id: string) => {
    const body = projectilesRef.current.get(id);
    if (body) {
      Matter.World.remove(worldRef.current, body);
      projectilesRef.current.delete(id);
      setProjectiles(prev => prev.filter(p => p.id !== id));
    }
  };

  // Game Loop
  const update = useCallback(() => {
    if (gameState.isPaused || gameState.isGameOver) return;

    Matter.Engine.update(engineRef.current, 1000 / 60);

    // Sync Enemy Positions
    setEnemies(prev => prev.map(e => {
      const body = enemiesRef.current.get(e.id);
      if (body) {
        let force;
        let speed = ENEMY_TYPES[e.type].speed;

        if (gameState.gameMode === 'level') {
          // Path Following Logic
          const waypointIndex = e.targetWaypointIndex || 0;
          const target = FIXED_PATH[waypointIndex];
          const dist = Math.hypot(target.x - body.position.x, target.y - body.position.y);

          // If reached waypoint, move to next
          if (dist < 20 && waypointIndex < FIXED_PATH.length - 1) {
            e.targetWaypointIndex = waypointIndex + 1;
          }

          force = Matter.Vector.normalise(Matter.Vector.sub(target, body.position));
          speed *= 0.8; // Slightly slow but not "very" slow in level mode anymore to keep balance
        } else {
          // Move directly towards base
          force = Matter.Vector.normalise(Matter.Vector.sub({ x: BASE_X, y: BASE_Y }, body.position));
          
          // --- Unique Behaviors for Infinite Mode ---
          if (e.type === 'wraith') {
            // Erratic sine-wave movement (sin wave perpendicular to movement vector)
            const perp = { x: -force.y, y: force.x };
            const wave = Math.sin(Date.now() * 0.01) * 0.5;
            force.x += perp.x * wave;
            force.y += perp.y * wave;
            force = Matter.Vector.normalise(force);
          } else if (e.type === 'blighter') {
            // Slight jitter for swarming effect
            force.x += (Math.random() - 0.5) * 0.2;
            force.y += (Math.random() - 0.5) * 0.2;
            force = Matter.Vector.normalise(force);
          }
        }

        Matter.Body.setVelocity(body, { x: force.x * speed, y: force.y * speed });
        
        return { ...e, x: body.position.x, y: body.position.y };
      }
      return e;
    }));

    // Sync Projectile Positions
    setProjectiles(prev => prev.map(p => {
      const body = projectilesRef.current.get(p.id);
      if (body) {
        // Remove if out of bounds
        if (body.position.x > CANVAS_WIDTH || body.position.x < 0 || body.position.y > CANVAS_HEIGHT || body.position.y < 0) {
          removeProjectile(p.id);
          return null;
        }
        return { ...p, x: body.position.x, y: body.position.y };
      }
      return p;
    }).filter((p): p is ProjectileData => p !== null));

    // Tower Shooting Logic
    const now = Date.now();
    towers.forEach(tower => {
      const baseCooldown = TOWER_TYPES[tower.type].cooldown;
      const actualCooldown = baseCooldown / tower.fireRateMultiplier;
      
      if (now - tower.lastShot > actualCooldown) {
        // Find nearest enemy
        let nearestEnemy: EnemyData | null = null;
        let minDist = TOWER_TYPES[tower.type].range;

        enemies.forEach(enemy => {
          const dist = Math.hypot(enemy.x - tower.x, enemy.y - tower.y);
          if (dist < minDist) {
            minDist = dist;
            nearestEnemy = enemy;
          }
        });

        if (nearestEnemy) {
          shoot(tower, nearestEnemy);
          tower.lastShot = now;
        }
      }
    });

    // Loot Magnet Logic
    setLoots(prev => {
      const updated = prev.map(loot => {
        const dx = BASE_X - loot.x;
        const dy = BASE_Y - loot.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist < 40) {
          // Trigger collection logic
          // Since we are inside setLoots, we can't easily call collectLoot which also calls setLoots
          // We'll handle the effect here and return null to filter it out
          applyLootEffect(loot.type);
          return null;
        }
        
        // Move towards base
        const speed = 4;
        const angle = Math.atan2(dy, dx);
        return {
          ...loot,
          x: loot.x + Math.cos(angle) * speed,
          y: loot.y + Math.sin(angle) * speed
        };
      }).filter((l): l is LootData => l !== null);
      return updated;
    });

    // Check Game Over
    if (gameState.health <= 0 && !gameState.isGameOver) {
      setGameState(prev => ({ ...prev, isGameOver: true }));
      updateHighScores(gameState.score);
    }

    // Spawn Enemies (Limit to 20 per wave)
    if (gameState.enemiesSpawnedInWave < 20) {
      if (Math.random() < 0.01 + (gameState.wave * 0.002)) {
        spawnEnemy();
      }
    }

    // Increment Wave when all enemies are cleared
    if (gameState.enemiesSpawnedInWave >= 20 && gameState.enemiesRemainingInWave <= 0) {
      setGameState(prev => ({ 
        ...prev, 
        wave: prev.wave + 1,
        enemiesSpawnedInWave: 0,
        enemiesRemainingInWave: 0
      }));
    }

    // Void Queen Specials: Occasionally spawns minions
    const voidQueen = enemies.find(e => e.type === 'voidqueen');
    if (voidQueen && Math.random() < 0.005) {
      spawnEnemy(Math.random() > 0.5 ? 'blighter' : 'wraith', voidQueen.x, voidQueen.y, true);
    }

    requestRef.current = requestAnimationFrame(update);
  }, [gameState, towers, enemies]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [update]);

  const spawnEnemy = (forcedType?: keyof typeof ENEMY_TYPES, forcedX?: number, forcedY?: number, isMinion: boolean = false) => {
    let type: keyof typeof ENEMY_TYPES;
    
    if (forcedType) {
      type = forcedType;
    } else {
      // Boss Level System: Every 10 waves
      const isBossWave = gameState.wave % 10 === 0;
      const bossSpawned = gameState.enemiesSpawnedInWave > 0 && isBossWave;

      if (isBossWave && gameState.enemiesSpawnedInWave === 0) {
        type = 'voidqueen';
      } else if (gameState.wave <= 5) {
        type = 'blighter';
      } else if (gameState.wave <= 10) {
        const types: (keyof typeof ENEMY_TYPES)[] = ['blighter', 'wraith'];
        type = types[Math.floor(Math.random() * types.length)];
      } else {
        const types: (keyof typeof ENEMY_TYPES)[] = ['blighter', 'wraith', 'crusher'];
        type = types[Math.floor(Math.random() * types.length)];
      }
      
      // If it's a boss wave and we already spawned the boss, spawn minions
      if (isBossWave && gameState.enemiesSpawnedInWave > 0) {
        const types: (keyof typeof ENEMY_TYPES)[] = ['blighter', 'wraith'];
        type = types[Math.floor(Math.random() * types.length)];
      }
    }

    const config = ENEMY_TYPES[type];
    const id = Math.random().toString(36).substr(2, 9);
    let x, y;

    if (forcedX !== undefined && forcedY !== undefined) {
      x = forcedX;
      y = forcedY;
    } else if (gameState.gameMode === 'level') {
      x = FIXED_PATH[0].x;
      y = FIXED_PATH[0].y;
    } else {
      x = CANVAS_WIDTH + 50;
      y = Math.random() * (CANVAS_HEIGHT - 100) + 50;
    }

    // Scaling: 5% increase per wave
    const scaleFactor = 1 + (gameState.wave - 1) * 0.05;
    const scaledHealth = config.health * scaleFactor;
    const scaledDamage = 20 * scaleFactor;

    const body = Matter.Bodies.circle(x, y, config.size, {
      label: 'enemy',
      frictionAir: 0,
      restitution: 0.5,
    });
    // @ts-ignore
    body.enemyId = id;
    // @ts-ignore
    body.enemyType = type;
    
    enemiesRef.current.set(id, body);
    Matter.World.add(worldRef.current, body);

    setEnemies(prev => [...prev, {
      id,
      x,
      y,
      health: scaledHealth,
      maxHealth: scaledHealth,
      damage: scaledDamage,
      type,
      targetWaypointIndex: gameState.gameMode === 'level' ? 1 : undefined
    }]);

    setGameState(prev => ({ 
      ...prev, 
      enemiesSpawnedInWave: isMinion ? prev.enemiesSpawnedInWave : prev.enemiesSpawnedInWave + 1,
      enemiesRemainingInWave: prev.enemiesRemainingInWave + 1
    }));
  };

  const shoot = (tower: TowerData, target: EnemyData) => {
    const config = TOWER_TYPES[tower.type];
    const id = Math.random().toString(36).substr(2, 9);
    
    const dx = target.x - tower.x;
    const dy = target.y - tower.y;
    const angle = Math.atan2(dy, dx);
    
    const projectile = Matter.Bodies.circle(tower.x, tower.y, 5, {
      label: 'projectile',
      mass: config.projectileMass,
      frictionAir: 0,
    });
    // @ts-ignore
    projectile.projectileDamage = tower.damageMultiplier;
    // @ts-ignore
    projectile.towerType = tower.type;
    
    Matter.Body.setVelocity(projectile, {
      x: Math.cos(angle) * config.projectileSpeed,
      y: Math.sin(angle) * config.projectileSpeed
    });

    projectilesRef.current.set(id, projectile);
    Matter.World.add(worldRef.current, projectile);

    setProjectiles(prev => [...prev, { id, x: tower.x, y: tower.y, radius: 5, damage: tower.damageMultiplier }]);
  };

  const handleCanvasClick = (e: any) => {
    if (gameState.isPaused || gameState.isGameOver) return;
    
    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();
    if (!pointerPosition) return;

    const { x, y } = pointerPosition;

    // Check if clicked ON a tower first for selection
    const clickedTower = towers.find(t => Math.hypot(t.x - x, t.y - y) < 25);
    if (clickedTower) {
      setSelectedTowerId(clickedTower.id);
      return;
    } else {
      setSelectedTowerId(null);
    }

    const cost = TOWER_TYPES[selectedTowerType].cost;

    if (gameState.money >= cost) {
      // Check for overlap
      const overlap = towers.some(t => Math.hypot(t.x - x, t.y - y) < 40);
      if (overlap) return;

      const id = Math.random().toString(36).substr(2, 9);
      const newTower: TowerData = {
        id,
        x,
        y,
        health: TOWER_TYPES[selectedTowerType].maxHealth,
        maxHealth: TOWER_TYPES[selectedTowerType].maxHealth,
        type: selectedTowerType,
        lastShot: 0,
        damageMultiplier: 1.0,
        fireRateMultiplier: 1.0,
        level: 1
      };

      // Add Physics for Tower
      const body = Matter.Bodies.rectangle(x, y, 40, 40, {
        isStatic: true,
        label: 'tower',
      });
      // @ts-ignore
      body.towerId = id;
      towersRef.current.set(id, body);
      Matter.World.add(worldRef.current, body);

      setTowers(prev => [...prev, newTower]);
      setGameState(prev => ({ ...prev, money: prev.money - cost }));
    }
  };

  const upgradeTower = (id: string) => {
    const tower = towers.find(t => t.id === id);
    if (!tower) return;

    const baseCost = TOWER_TYPES[tower.type as keyof typeof TOWER_TYPES]?.cost || 100;
    const upgradeCost = Math.floor(baseCost * (tower.level * 0.8));

    if (gameState.money >= upgradeCost) {
      setGameState(gs => ({ ...gs, money: gs.money - upgradeCost }));
      setTowers(prev => prev.map(t => {
        if (t.id === id) {
          return {
            ...t,
            level: t.level + 1,
            damageMultiplier: t.damageMultiplier * 1.2,
            fireRateMultiplier: t.fireRateMultiplier * 1.1,
            maxHealth: t.maxHealth + 20,
            health: Math.min(t.maxHealth + 20, t.health + 30) // Heal on upgrade
          };
        }
        return t;
      }));
    }
  };

  const resetGame = (mode?: 'infinite' | 'level') => {
    // Clear physics
    Matter.World.clear(worldRef.current, false);
    enemiesRef.current.clear();
    towersRef.current.clear();
    projectilesRef.current.clear();
    
    // Re-add base
    if (baseRef.current) Matter.World.add(worldRef.current, baseRef.current);

    setSelectedTowerId(null);
    setGameState(prev => ({
      score: 0,
      money: 200,
      health: 100,
      wave: 1,
      enemiesSpawnedInWave: 0,
      enemiesRemainingInWave: 0,
      isGameOver: false,
      isPaused: false,
      playerName: prev.playerName,
      gameMode: mode || prev.gameMode,
      view: 'game',
    }));
    setTowers([]);
    setEnemies([]);
    setProjectiles([]);
    setLoots([]);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'enemy' | 'base') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setCustomization(prev => ({
          ...prev,
          [`${type}ImageUrl`]: base64String,
          [`${type}Skin`]: 'custom'
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  if (gameState.view === 'home') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-6 overflow-hidden relative">
        <BackgroundAnimation />
        
        {/* Background Decorative Elements */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-red-600/5 rounded-full blur-[120px] animate-pulse delay-1000" />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="z-10 text-center max-w-2xl"
        >
          <motion.h1 
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="text-8xl font-black tracking-tighter italic uppercase text-indigo-500 mb-4 drop-shadow-[0_0_30px_rgba(79,70,229,0.5)]"
          >
            Aetherium
          </motion.h1>
          <p className="text-white/40 uppercase tracking-[0.5em] text-sm mb-12 font-mono">
            The Vertical Bastion // High Altitude Defense
          </p>

          <div className="flex flex-col gap-4 max-w-xs mx-auto mb-12">
            <button 
              onClick={() => {
                setNameEntryStep('name');
                setPlayerNameInput('');
                fetchPlayers();
                setGameState(s => ({ ...s, view: 'nameEntry' }));
              }}
              className="group relative px-8 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-black text-xl uppercase italic tracking-tighter transition-all hover:scale-105 active:scale-95 shadow-[0_0_40px_rgba(79,70,229,0.4)]"
            >
              New Game
            </button>

            {hasSavedGame && (
              <button 
                onClick={loadGame}
                className="group relative px-8 py-4 bg-white/10 hover:bg-white/20 rounded-2xl font-black text-xl uppercase italic tracking-tighter transition-all hover:scale-105 active:scale-95 border border-white/10"
              >
                Continue Game
              </button>
            )}

            <button 
              onClick={() => setGameState(s => ({ ...s, view: 'highscores' }))}
              className="group relative px-8 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-black text-xl uppercase italic tracking-tighter transition-all hover:scale-105 active:scale-95 border border-white/5"
            >
              High Scores
            </button>

            <button 
              onClick={() => setGameState(s => ({ ...s, view: 'options' }))}
              className="group relative px-8 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-black text-xl uppercase italic tracking-tighter transition-all hover:scale-105 active:scale-95 border border-white/5"
            >
              Options
            </button>

            <button 
              onClick={() => window.location.reload()}
              className="group relative px-8 py-4 bg-red-900/20 hover:bg-red-900/40 rounded-2xl font-black text-xl uppercase italic tracking-tighter transition-all hover:scale-105 active:scale-95 border border-red-500/10 text-red-400"
            >
              Exit
            </button>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="bg-white/5 backdrop-blur-md p-6 rounded-3xl border border-white/10 hover:border-indigo-500/50 transition-colors group">
              <Shield className="w-10 h-10 text-indigo-400 mb-4 group-hover:scale-110 transition-transform" />
              <h3 className="font-bold mb-1">Defend</h3>
              <p className="text-xs text-white/40">Strategic tower placement is key to survival.</p>
            </div>
            <div className="bg-white/5 backdrop-blur-md p-6 rounded-3xl border border-white/10 hover:border-red-500/50 transition-colors group">
              <Zap className="w-10 h-10 text-red-400 mb-4 group-hover:scale-110 transition-transform" />
              <h3 className="font-bold mb-1">Upgrade</h3>
              <p className="text-xs text-white/40">Collect drops to boost damage and fire rate.</p>
            </div>
            <div className="bg-white/5 backdrop-blur-md p-6 rounded-3xl border border-white/10 hover:border-yellow-500/50 transition-colors group">
              <Target className="w-10 h-10 text-yellow-400 mb-4 group-hover:scale-110 transition-transform" />
              <h3 className="font-bold mb-1">Bosses</h3>
              <p className="text-xs text-white/40">Face massive threats every 10 waves.</p>
            </div>
          </div>
        </motion.div>

        <footer className="fixed bottom-8 text-white/20 text-xs font-mono uppercase tracking-[0.3em]">
          System Version 2.0 // Physics Engine Active
        </footer>
      </div>
    );
  }

  if (gameState.view === 'nameEntry') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <BackgroundAnimation />
        <div className="max-w-md w-full bg-white/5 backdrop-blur-xl p-12 rounded-[40px] border border-white/10 z-10">
          <AnimatePresence mode="wait">
            {nameEntryStep === 'name' ? (
              <motion.div
                key="name-step"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <h2 className="text-4xl font-black italic uppercase tracking-tighter text-indigo-500">Who is playing?</h2>
                
                {previousPlayers.length > 0 && (
                  <div className="space-y-3">
                    <label className="text-[10px] uppercase tracking-[0.2em] opacity-40 font-bold block">Previous Commanders</label>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                      {previousPlayers.map(p => (
                        <button
                          key={p}
                          onClick={() => {
                            setPlayerNameInput(p);
                            setGameState(s => ({ ...s, playerName: p }));
                            setNameEntryStep('mode');
                          }}
                          className="px-4 py-3 bg-white/5 hover:bg-indigo-500/20 border border-white/10 rounded-xl text-sm font-bold transition-all text-left truncate"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <label className="text-[10px] uppercase tracking-[0.2em] opacity-40 font-bold block">New Identity</label>
                  <input 
                    type="text"
                    value={playerNameInput}
                    onChange={(e) => setPlayerNameInput(e.target.value)}
                    placeholder="Enter Name..."
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 font-mono text-xl focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-4">
                  <button 
                    onClick={() => {
                      if (playerNameInput.trim()) {
                        setGameState(s => ({ ...s, playerName: playerNameInput.trim() }));
                        setNameEntryStep('mode');
                      }
                    }}
                    disabled={!playerNameInput.trim()}
                    className="w-full py-4 bg-indigo-600 disabled:opacity-50 disabled:hover:scale-100 text-white rounded-2xl font-bold uppercase tracking-tighter hover:scale-105 transition-transform shadow-[0_0_30px_rgba(79,70,229,0.3)]"
                  >
                    Confirm Rank
                  </button>
                  <button 
                    onClick={() => setGameState(s => ({ ...s, view: 'home' }))}
                    className="w-full py-4 bg-white/5 text-white/50 rounded-2xl font-bold uppercase tracking-tighter hover:bg-white/10 transition-all text-sm"
                  >
                    Back to HQ
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="mode-step"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="space-y-1">
                  <h2 className="text-4xl font-black italic uppercase tracking-tighter text-indigo-500">Operation Type</h2>
                  <p className="text-xs text-white/40 font-bold uppercase tracking-widest leading-none">Commander: {gameState.playerName}</p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <button 
                    onClick={() => {
                      resetGame('infinite');
                    }}
                    className="group relative p-6 bg-white/5 hover:bg-indigo-600/20 border border-white/10 hover:border-indigo-500/50 rounded-[32px] transition-all text-left"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <Zap className="w-8 h-8 text-indigo-400" />
                      <span className="text-[10px] bg-indigo-500/20 px-2 py-1 rounded text-indigo-300 font-bold uppercase tracking-widest">High Stakes</span>
                    </div>
                    <h3 className="text-2xl font-black italic uppercase tracking-tight mb-1">Infinite War</h3>
                    <p className="text-xs text-white/40 leading-relaxed">Direct assault. Enemies swarm from all directions. Classic challenge.</p>
                  </button>

                  <button 
                    onClick={() => {
                      resetGame('level');
                    }}
                    className="group relative p-6 bg-white/5 hover:bg-red-600/20 border border-white/10 hover:border-red-500/50 rounded-[32px] transition-all text-left"
                  >
                    <div className="flex justify-between items-start mb-2">
                       <Target className="w-8 h-8 text-red-400" />
                       <span className="text-[10px] bg-red-500/20 px-2 py-1 rounded text-red-300 font-bold uppercase tracking-widest">Tactical</span>
                    </div>
                    <h3 className="text-2xl font-black italic uppercase tracking-tight mb-1">Level Base</h3>
                    <p className="text-xs text-white/40 leading-relaxed">Planned trajectory. Enemies follow a fixed path at reduced speed.</p>
                  </button>
                </div>

                <button 
                  onClick={() => setNameEntryStep('name')}
                  className="w-full py-4 bg-white/5 text-white/30 rounded-2xl font-bold uppercase tracking-tighter hover:bg-white/10 transition-all text-sm"
                >
                  Change Pilot
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  if (gameState.view === 'highscores') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <BackgroundAnimation />
        <div className="max-w-md w-full bg-white/5 backdrop-blur-xl p-12 rounded-[40px] border border-white/10 z-10">
          <h2 className="text-4xl font-black italic uppercase tracking-tighter mb-8 text-indigo-500">Hall of Fame</h2>
          
          <div className="space-y-4 mb-12">
            {highScores.length > 0 ? (
              highScores.map((score, i) => (
                <div key={i} className="flex justify-between items-center p-4 bg-white/5 rounded-2xl border border-white/5">
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-black italic text-indigo-500/50">#0{i + 1}</span>
                    <div>
                      <div className="text-sm uppercase tracking-widest font-bold text-indigo-400">{score.name}</div>
                      <div className="text-xl font-mono font-bold">{score.score.toLocaleString()}</div>
                      <div className="text-[10px] uppercase tracking-widest opacity-30">{score.date}</div>
                    </div>
                  </div>
                  <Target className="w-5 h-5 text-indigo-500/30" />
                </div>
              ))
            ) : (
              <div className="text-center py-8 opacity-30 italic">No records found yet...</div>
            )}
          </div>

          <button 
            onClick={() => setGameState(s => ({ ...s, view: 'home' }))}
            className="w-full py-4 bg-white text-black rounded-2xl font-bold uppercase tracking-tighter hover:scale-105 transition-transform"
          >
            Back to Menu
          </button>
        </div>
      </div>
    );
  }

  if (gameState.view === 'options') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-6 overflow-y-auto">
        <div className="max-w-2xl w-full bg-white/5 backdrop-blur-xl p-12 rounded-[40px] border border-white/10 my-12">
          <h2 className="text-4xl font-black italic uppercase tracking-tighter mb-8 text-indigo-500">Options</h2>
          
          <div className="space-y-12 mb-12">
            {/* Audio & Difficulty */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="text-xs uppercase tracking-widest opacity-50 block mb-4">Master Volume</label>
                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full w-3/4 bg-indigo-500" />
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest opacity-50 block mb-4">Difficulty</label>
                <div className="flex gap-2">
                  {['Normal', 'Hard', 'Extreme'].map(d => (
                    <button key={d} className={`flex-1 py-2 rounded-xl text-sm font-bold border ${d === 'Hard' ? 'bg-indigo-600 border-indigo-500' : 'bg-white/5 border-white/10 opacity-50'}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Customization Section */}
            <div className="space-y-8 pt-8 border-t border-white/10">
              <h3 className="text-xl font-bold uppercase italic tracking-tight flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-indigo-400" />
                Visual Customization
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Enemy Customization */}
                <div className="space-y-4">
                  <label className="text-xs uppercase tracking-widest opacity-50 block">Enemy Appearance</label>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {['default', 'neon', 'classic', 'custom'].map(skin => (
                      <button 
                        key={skin}
                        onClick={() => setCustomization(p => ({ ...p, enemySkin: skin as any }))}
                        className={`py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border ${customization.enemySkin === skin ? 'bg-indigo-600 border-indigo-500' : 'bg-white/5 border-white/10 opacity-50'}`}
                      >
                        {skin}
                      </button>
                    ))}
                  </div>
                  
                  {customization.enemySkin === 'custom' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-center w-full">
                        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-white/10 rounded-2xl cursor-pointer hover:bg-white/5 transition-colors">
                          <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <Upload className="w-8 h-8 text-white/30 mb-2" />
                            <p className="text-xs text-white/40">Upload Enemy PNG</p>
                          </div>
                          <input type="file" className="hidden" accept="image/png" onChange={(e) => handleImageUpload(e, 'enemy')} />
                        </label>
                      </div>
                      {customization.enemyImageUrl && (
                        <div className="flex items-center gap-4 p-3 bg-white/5 rounded-xl border border-white/10">
                          <img src={customization.enemyImageUrl} alt="Enemy Preview" className="w-10 h-10 object-contain rounded" />
                          <span className="text-xs opacity-50 truncate">Custom Skin Loaded</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Base Customization */}
                <div className="space-y-4">
                  <label className="text-xs uppercase tracking-widest opacity-50 block">Base Appearance</label>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {['default', 'fortress', 'tech', 'custom'].map(skin => (
                      <button 
                        key={skin}
                        onClick={() => setCustomization(p => ({ ...p, baseSkin: skin as any }))}
                        className={`py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border ${customization.baseSkin === skin ? 'bg-indigo-600 border-indigo-500' : 'bg-white/5 border-white/10 opacity-50'}`}
                      >
                        {skin}
                      </button>
                    ))}
                  </div>

                  {customization.baseSkin === 'custom' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-center w-full">
                        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-white/10 rounded-2xl cursor-pointer hover:bg-white/5 transition-colors">
                          <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <Upload className="w-8 h-8 text-white/30 mb-2" />
                            <p className="text-xs text-white/40">Upload Base PNG</p>
                          </div>
                          <input type="file" className="hidden" accept="image/png" onChange={(e) => handleImageUpload(e, 'base')} />
                        </label>
                      </div>
                      {customization.baseImageUrl && (
                        <div className="flex items-center gap-4 p-3 bg-white/5 rounded-xl border border-white/10">
                          <img src={customization.baseImageUrl} alt="Base Preview" className="w-10 h-10 object-contain rounded" />
                          <span className="text-xs opacity-50 truncate">Custom Skin Loaded</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <button 
            onClick={() => setGameState(s => ({ ...s, view: 'home' }))}
            className="w-full py-4 bg-white text-black rounded-2xl font-bold uppercase tracking-tighter hover:scale-105 transition-transform"
          >
            Back to Menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-indigo-500/30">
      {/* Header UI */}
      <header className="fixed top-0 left-0 right-0 z-10 p-6 flex justify-between items-start pointer-events-none">
          <div className="flex flex-col gap-2 pointer-events-auto">
            <div className="flex items-center gap-3">
              <motion.h1 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-4xl font-black tracking-tighter italic uppercase text-indigo-500"
              >
                Aetherium
              </motion.h1>
              <div className="bg-indigo-500/20 px-3 py-1 rounded-lg border border-indigo-500/30">
                <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-indigo-400 block leading-none mb-1">Pilot</span>
                <span className="text-sm font-mono font-bold text-white leading-none">{gameState.playerName}</span>
              </div>
            </div>
            <div className="flex gap-4">
            <div className="flex items-center gap-2 bg-white/5 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
              <Coins className="w-4 h-4 text-indigo-400" />
              <span className="font-mono font-bold">{gameState.money} Scrap</span>
            </div>
            <div className="flex items-center gap-2 bg-white/5 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
              <Heart className="w-4 h-4 text-red-500" />
              <span className="font-mono font-bold">{gameState.health}%</span>
            </div>
            <div className="flex items-center gap-2 bg-white/5 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
              <Swords className="w-4 h-4 text-indigo-400" />
              <span className="font-mono font-bold">Wave {gameState.wave}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-4 pointer-events-auto">
          <div className="flex gap-2">
            <button 
              onClick={() => setGameState(s => ({ ...s, isPaused: !s.isPaused }))}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors"
            >
              {gameState.isPaused ? <Play className="w-6 h-6" /> : <Zap className="w-6 h-6 text-yellow-400" />}
            </button>
            <button 
              onClick={() => {
                saveGame();
                setGameState(s => ({ ...s, view: 'home', isPaused: true }));
              }}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors group relative"
              title="Save & Exit to Menu"
            >
              <RotateCcw className="w-6 h-6 rotate-180" />
            </button>
            <button 
              onClick={() => resetGame()}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors"
            >
              <RotateCcw className="w-6 h-6" />
            </button>
            <button 
              onClick={() => setShowInfo(!showInfo)}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors"
            >
              <Info className="w-6 h-6" />
            </button>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-widest opacity-50">Score</div>
            <div className="text-3xl font-mono font-black">{gameState.score.toLocaleString()}</div>
          </div>
        </div>
      </header>

      {/* Main Game Area */}
      <main className="relative w-full h-screen flex items-center justify-center overflow-hidden">
        <div className="relative border border-white/10 rounded-3xl overflow-hidden shadow-2xl shadow-indigo-500/10">
          <Stage 
            width={CANVAS_WIDTH} 
            height={CANVAS_HEIGHT} 
            onClick={handleCanvasClick}
            className="bg-[#111111] cursor-crosshair"
          >
            <Layer>
              {/* Grid Lines */}
              {Array.from({ length: 20 }).map((_, i) => (
                <Line
                  key={`v-${i}`}
                  points={[i * 50, 0, i * 50, CANVAS_HEIGHT]}
                  stroke="rgba(255,255,255,0.03)"
                  strokeWidth={1}
                />
              ))}
              {Array.from({ length: 12 }).map((_, i) => (
                <Line
                  key={`h-${i}`}
                  points={[0, i * 50, CANVAS_WIDTH, i * 50]}
                  stroke="rgba(255,255,255,0.03)"
                  strokeWidth={1}
                />
              ))}

              {/* Path Visualization for Level Mode */}
              {gameState.gameMode === 'level' && (
                <Line
                  points={FIXED_PATH.flatMap(p => [p.x, p.y])}
                  stroke="#ef4444"
                  strokeWidth={2}
                  opacity={0.15}
                  dash={[10, 5]}
                />
              )}

              {/* Base */}
              {customization.baseSkin === 'custom' && baseImage ? (
                <KonvaImage
                  image={baseImage}
                  x={BASE_X - BASE_WIDTH / 2}
                  y={BASE_Y - BASE_HEIGHT / 2}
                  width={BASE_WIDTH}
                  height={BASE_HEIGHT}
                  shadowBlur={20}
                  shadowColor="#4f46e5"
                  shadowOpacity={0.5}
                />
              ) : customization.baseSkin === 'fortress' ? (
                <Rect
                  x={BASE_X - BASE_WIDTH / 2}
                  y={BASE_Y - BASE_HEIGHT / 2}
                  width={BASE_WIDTH}
                  height={BASE_HEIGHT}
                  fill="#1a1a1a"
                  stroke="#666"
                  strokeWidth={8}
                  cornerRadius={4}
                />
              ) : customization.baseSkin === 'tech' ? (
                <Rect
                  x={BASE_X - BASE_WIDTH / 2}
                  y={BASE_Y - BASE_HEIGHT / 2}
                  width={BASE_WIDTH}
                  height={BASE_HEIGHT}
                  fill="#000"
                  stroke="#4f46e5"
                  strokeWidth={2}
                  cornerRadius={12}
                  shadowBlur={30}
                  shadowColor="#4f46e5"
                  shadowOpacity={0.8}
                />
              ) : (
                <Rect
                  x={BASE_X - BASE_WIDTH / 2}
                  y={BASE_Y - BASE_HEIGHT / 2}
                  width={BASE_WIDTH}
                  height={BASE_HEIGHT}
                  fill="#1e1b4b"
                  stroke="#4f46e5"
                  strokeWidth={4}
                  cornerRadius={8}
                  shadowBlur={20}
                  shadowColor="#4f46e5"
                  shadowOpacity={0.5}
                />
              )}
              <Text
                x={BASE_X - 30}
                y={BASE_Y - 10}
                text="CORE"
                fontSize={12}
                fontFamily="monospace"
                fill="#4f46e5"
                fontStyle="bold"
              />

              {/* Towers */}
              {towers.map(tower => (
                <Group key={tower.id} x={tower.x} y={tower.y}>
                  {/* Selection Indicator */}
                  {selectedTowerId === tower.id && (
                    <Circle
                      radius={35}
                      stroke="#4f46e5"
                      strokeWidth={2}
                      dash={[5, 10]}
                    />
                  )}
                  
                  <Rect
                    x={-20}
                    y={-20}
                    width={40}
                    height={40}
                    fill={TOWER_TYPES[tower.type].color}
                    cornerRadius={4}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                  {/* Tower Health Bar */}
                  <Rect
                    x={-15}
                    y={25}
                    width={30}
                    height={4}
                    fill="#333"
                  />
                  <Rect
                    x={-15}
                    y={25}
                    width={(tower.health / tower.maxHealth) * 30}
                    height={4}
                    fill="#10b981"
                  />

                  {/* Tower Level Text */}
                  <Text
                    text={`LVL ${tower.level}`}
                    x={-15}
                    y={-38}
                    fontSize={10}
                    fontFamily="monospace"
                    fill="#818cf8"
                    fontStyle="bold"
                    shadowBlur={5}
                    shadowColor="#000"
                  />

                  <Circle
                    radius={TOWER_TYPES[tower.type].range}
                    stroke={TOWER_TYPES[tower.type].color}
                    strokeWidth={1}
                    dash={[5, 5]}
                    opacity={0.2}
                  />
                </Group>
              ))}

              {/* Loot */}
              {loots.map(loot => (
                <Group 
                  key={loot.id} 
                  x={loot.x} 
                  y={loot.y} 
                  onClick={() => collectLoot(loot.id)}
                  onTap={() => collectLoot(loot.id)}
                >
                  <Circle
                    radius={12}
                    fill={loot.type === 'repair' ? '#10b981' : loot.type === 'damage' ? '#ef4444' : '#3b82f6'}
                    stroke="#fff"
                    strokeWidth={2}
                    shadowBlur={10}
                    shadowColor={loot.type === 'repair' ? '#10b981' : loot.type === 'damage' ? '#ef4444' : '#3b82f6'}
                  />
                  <Text
                    x={-6}
                    y={-6}
                    text={loot.type === 'repair' ? '+' : loot.type === 'damage' ? 'D' : 'R'}
                    fontSize={14}
                    fill="#fff"
                    fontStyle="bold"
                  />
                </Group>
              ))}

              {/* Enemies */}
              {enemies.map(enemy => (
                <Group key={enemy.id} x={enemy.x} y={enemy.y}>
                  {customization.enemySkin === 'custom' && enemyImage ? (
                    <KonvaImage
                      image={enemyImage}
                      x={-ENEMY_TYPES[enemy.type].size}
                      y={-ENEMY_TYPES[enemy.type].size}
                      width={ENEMY_TYPES[enemy.type].size * 2}
                      height={ENEMY_TYPES[enemy.type].size * 2}
                    />
                  ) : customization.enemySkin === 'neon' ? (
                    <Circle
                      radius={ENEMY_TYPES[enemy.type].size}
                      fill="#000"
                      stroke={ENEMY_TYPES[enemy.type].color}
                      strokeWidth={3}
                      shadowBlur={15}
                      shadowColor={ENEMY_TYPES[enemy.type].color}
                    />
                  ) : customization.enemySkin === 'classic' ? (
                    <Rect
                      x={-ENEMY_TYPES[enemy.type].size}
                      y={-ENEMY_TYPES[enemy.type].size}
                      width={ENEMY_TYPES[enemy.type].size * 2}
                      height={ENEMY_TYPES[enemy.type].size * 2}
                      fill={ENEMY_TYPES[enemy.type].color}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  ) : (
                    <Circle
                      radius={ENEMY_TYPES[enemy.type].size}
                      fill={ENEMY_TYPES[enemy.type].color}
                      stroke="#fff"
                      strokeWidth={1}
                    />
                  )}
                  {/* Health Bar */}
                  <Rect
                    x={-15}
                    y={-ENEMY_TYPES[enemy.type].size - 10}
                    width={30}
                    height={4}
                    fill="#333"
                  />
                  <Rect
                    x={-15}
                    y={-ENEMY_TYPES[enemy.type].size - 10}
                    width={(enemy.health / enemy.maxHealth) * 30}
                    height={4}
                    fill="#ef4444"
                  />
                </Group>
              ))}

              {/* Projectiles */}
              {projectiles.map(p => (
                <Circle
                  key={p.id}
                  x={p.x}
                  y={p.y}
                  radius={p.radius}
                  fill="#fff"
                  shadowBlur={10}
                  shadowColor="#fff"
                />
              ))}
            </Layer>
          </Stage>

          {/* Overlay Screens */}
          <AnimatePresence>
            {(gameState.isPaused && !gameState.isGameOver) && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-20"
              >
                <div className="text-center">
                  <h2 className="text-6xl font-black italic uppercase tracking-tighter mb-8">Paused</h2>
                  <button 
                    onClick={() => setGameState(s => ({ ...s, isPaused: false }))}
                    className="group flex items-center gap-4 bg-indigo-600 hover:bg-indigo-500 px-8 py-4 rounded-2xl font-bold text-xl transition-all hover:scale-105 active:scale-95"
                  >
                    <Play className="w-8 h-8 fill-current" />
                    Resume Mission
                  </button>
                </div>
              </motion.div>
            )}

            {gameState.isGameOver && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-red-950/80 backdrop-blur-md flex items-center justify-center z-20"
              >
                <div className="text-center p-12 bg-black/40 rounded-3xl border border-red-500/30">
                  <h2 className="text-7xl font-black italic uppercase tracking-tighter text-red-500 mb-2">Defeated</h2>
                  <p className="text-white/60 mb-8 font-mono">The core has been compromised.</p>
                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-white/5 p-4 rounded-xl">
                      <div className="text-xs uppercase opacity-50">Final Score</div>
                      <div className="text-2xl font-mono font-bold">{gameState.score}</div>
                    </div>
                    <div className="bg-white/5 p-4 rounded-xl">
                      <div className="text-xs uppercase opacity-50">Waves Survived</div>
                      <div className="text-2xl font-mono font-bold">{gameState.wave}</div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => resetGame()}
                      className="w-full flex items-center justify-center gap-4 bg-white text-black hover:bg-indigo-50 px-8 py-4 rounded-2xl font-bold text-xl transition-all hover:scale-105 active:scale-95"
                    >
                      <RotateCcw className="w-6 h-6" />
                      Try Again
                    </button>
                    <button 
                      onClick={() => setGameState(s => ({ ...s, view: 'home', isGameOver: false }))}
                      className="w-full flex items-center justify-center gap-4 bg-white/10 hover:bg-white/20 px-8 py-4 rounded-2xl font-bold text-xl transition-all hover:scale-105 active:scale-95"
                    >
                      Home Menu
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Tower Action UI */}
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6 bg-[#0f0f0f]/90 backdrop-blur-2xl p-4 px-6 rounded-[32px] border border-white/10 shadow-2xl">
          {selectedTowerId ? (
            // Upgrade Panel
            <div className="flex items-center gap-6">
              {(() => {
                const tower = towers.find(t => t.id === selectedTowerId);
                if (!tower) return null;
                const baseConfig = TOWER_TYPES[tower.type as keyof typeof TOWER_TYPES];
                const baseCost = baseConfig?.cost || 100;
                const upgradeCost = Math.floor(baseCost * (tower.level * 0.8));
                return (
                  <>
                    <div className="flex items-center gap-4">
                      <div 
                        className="w-12 h-12 rounded-xl border border-white/20 flex items-center justify-center shadow-lg"
                        style={{ backgroundColor: baseConfig.color }}
                      >
                        <Shield className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex flex-col">
                        <div className="text-[10px] uppercase font-black text-indigo-400 tracking-widest leading-none mb-1">Level {tower.level} Floor</div>
                        <div className="text-xl font-black italic uppercase tracking-tighter leading-none">{baseConfig.label}</div>
                      </div>
                    </div>
                    
                    <div className="h-10 w-px bg-white/10" />

                    <div className="flex gap-3">
                      <button
                        onClick={() => upgradeTower(selectedTowerId)}
                        disabled={gameState.money < upgradeCost}
                        className={`flex flex-col items-center justify-center px-8 py-2 rounded-2xl transition-all ${
                          gameState.money >= upgradeCost 
                          ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_30px_rgba(79,70,229,0.3)] hover:scale-105 active:scale-95' 
                          : 'bg-white/5 text-white/20 cursor-not-allowed'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 fill-current" />
                          <span className="font-black uppercase text-sm italic tracking-tighter">Upgrade</span>
                        </div>
                        <div className="text-[10px] font-mono tracking-widest opacity-80">{upgradeCost} SAC</div>
                      </button>

                      <button
                        onClick={() => setSelectedTowerId(null)}
                        className="p-4 bg-white/5 hover:bg-white/10 text-white/60 rounded-2xl transition-all hover:text-white"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            // Purchase Panel
            <div className="flex gap-4">
              {(Object.entries(TOWER_TYPES) as [keyof typeof TOWER_TYPES, typeof TOWER_TYPES['basic']][]).map(([type, config]) => (
                <button
                  key={type}
                  onClick={() => setSelectedTowerType(type)}
                  className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl transition-all ${
                    selectedTowerType === type 
                    ? 'bg-white/10 ring-2 ring-indigo-500 scale-110' 
                    : 'hover:bg-white/5 opacity-60 hover:opacity-100'
                  }`}
                >
                  <div 
                    className="w-10 h-10 rounded-lg shadow-lg"
                    style={{ backgroundColor: config.color }}
                  />
                  <div className="text-center">
                    <div className="text-[10px] uppercase font-bold tracking-widest leading-none mb-1">{config.label}</div>
                    <div className="text-xs font-mono text-indigo-400 leading-none">{config.cost} SAC</div>
                  </div>
                  {selectedTowerType === type && (
                    <motion.div 
                      layoutId="active-indicator"
                      className="absolute -top-1 -right-1 w-3 h-3 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(79,70,229,0.8)]"
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Info Modal */}
      <AnimatePresence>
        {showInfo && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none"
          >
            <div className="bg-[#151515] border border-white/10 p-8 rounded-3xl max-w-md shadow-2xl pointer-events-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold italic uppercase">Mission Briefing</h3>
                <button onClick={() => setShowInfo(false)} className="opacity-50 hover:opacity-100">✕</button>
              </div>
              <div className="space-y-4 text-white/70 leading-relaxed">
                <p>
                  Welcome to <span className="text-indigo-400 font-bold italic">Aetherium</span>. 
                  You are the commander of the last bastion above the toxic clouds.
                </p>
                <ul className="space-y-2 list-disc list-inside">
                  <li><span className="text-white font-bold">Cloud-Mutes:</span> Mutated creatures will swarm your lower floors.</li>
                  <li><span className="text-white font-bold">Vertical Construction:</span> Build Artillery Decks and Farms to survive.</li>
                  <li><span className="text-white font-bold">Scrap Alloys:</span> Collect salvage from fallen foes to expand.</li>
                  <li><span className="text-white font-bold">Physics Engine:</span> Every shell fired has mass and momentum IMPACT.</li>
                </ul>
                <p className="text-sm italic opacity-50">
                  Tip: Place towers strategically to maximize their range and momentum transfer.
                </p>
              </div>
              <button 
                onClick={() => setShowInfo(false)}
                className="w-full mt-8 bg-white/5 hover:bg-white/10 py-3 rounded-xl font-bold transition-colors"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=JetBrains+Mono:wght@400;700&display=swap');
        
        :root {
          --font-sans: 'Inter', sans-serif;
          --font-mono: 'JetBrains Mono', monospace;
        }

        body {
          background-color: #0a0a0a;
          margin: 0;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
