"""
ForensIA - Servidor API Backend
=============
API REST para la aplicación web ForensIA para reconstrucción forense de accidentes.

Ejecución local:
    python api/main.py
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
import sys
from pathlib import Path

# Permitir imports del paquete utils/ sin instalación como paquete
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from utils.ai_engine import (
    check_ollama_running,
    list_local_models,
    generate_simulation,
    DEFAULT_MODEL,
    RECOMMENDED_MODELS
)

app = FastAPI(
    title="ForensIA API",
    version="2.0.0",
    description="Motor de Inferencia Cinemática y Reconstrucción Forense (NIC-RF) con IA generativa local"
)

# Habilitar CORS completo para el frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Servir frontend estático
FRONTEND_DIR = PROJECT_ROOT / "frontend"
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


class SimulationRequest(BaseModel):
    """Solicitud para generar simulación forense."""
    relato: str
    model: str = DEFAULT_MODEL
    base_url: str = "http://localhost:11434"


@app.get("/api/status")
def get_status():
    """Verifica si el servidor Ollama está activo."""
    is_running = check_ollama_running()
    return {"ollama_running": is_running}


@app.get("/api/models")
def get_models():
    """Obtiene lista de modelos Ollama instalados y recomendados."""
    models = list_local_models()
    model_names = [m.get("name", "") for m in models]
    return {
        "installed": model_names,
        "recommended": RECOMMENDED_MODELS,
        "default": DEFAULT_MODEL
    }


@app.post("/api/simulate")
def simulate(req: SimulationRequest):
    """Genera simulación forense a partir de relato en lenguaje natural."""
    if not req.relato.strip():
        raise HTTPException(status_code=400, detail="El relato está vacío.")

    if not check_ollama_running(req.base_url):
        raise HTTPException(status_code=503, detail="Ollama no está activo.")

    try:
        payload = generate_simulation(
            relato=req.relato,
            model=req.model,
            base_url=req.base_url
        )
        return payload
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error inesperado: {str(e)}")


@app.post("/api/turtle-script")
def generate_turtle_script(payload: dict):
    """
    Recibe los datos de simulacion y genera un script Python con Turtle.
    El script dibuja la escena forense 2D y anima los vehiculos.
    """
    # Importar aqui para evitar dependencia circular
    from utils.vehicles import Scene

    scene = _build_scene_from_payload(payload)
    script = _build_turtle_script_from_scene(scene)
    return PlainTextResponse(content=script, media_type="text/plain")
def _build_scene_from_payload(payload: dict) -> Scene:
    """
    Construye un objeto Scene a partir del payload de la AI.
    """
    from utils.vehicles import Scene, Vehicle, ImpactEvent

    scene = Scene(
        infraestructura=payload.get("infraestructura", "interseccion_cruciforme"),
        dictamen=payload.get("dictamen_tecnico", "")
    )
    
    # Crear vehículos y agregar frames
    frames = payload.get("animacion_actores", [])
    for i, frame in enumerate(frames[:2]):  # Solo V1 y V2
        vehicle = Vehicle.from_dict(frame, f"V{i+1}")
        scene.add_vehicle(vehicle)
        
        # Convertir el frame al formato interno de Scene (con timestamp)
        internal_frame = {
            'timestamp': frame['segundo'],
            'v1_x': frame['v1_x'],
            'v1_y': frame['v1_y'],
            'v1_angulo': frame['v1_angulo'],
            'v2_x': frame.get('v2_x', 0.0),
            'v2_y': frame.get('v2_y', 0.0),
            'v2_angulo': frame.get('v2_angulo', 0.0)
        }
        scene.frames.append(internal_frame)
    
    # Establecer evento de impacto en el frame del segundo crítico
    if frames:
        impact_time = frames[len(frames)//2]["segundo"]
        scene.set_impact_event(ImpactEvent(
            timestamp=impact_time,
            position={'x': 0.0, 'y': 0.0},
            vehicles=scene.vehicles
        ))
    
    return scene
def _build_turtle_script_from_scene(scene: Scene) -> str:
    """
    Construye el script de Turtle a partir de un objeto Scene.
    """
    frames = scene.get_actors_data()
    
    frames_code = []
    for frame in frames:
        frames_code.append(
            f"    {{'t': {frame['segundo']}, "
            f"'v1_x': {frame['v1_x']}, 'v1_y': {frame['v1_y']}, 'v1_a': {frame['v1_angulo']}, "
            f"'v2_x': {frame['v2_x']}, 'v2_y': {frame['v2_y']}, 'v2_a': {frame['v2_angulo']}}},"
        )

    frames_str = "\n".join(frames_code)
    
    script = f'''#!/usr/bin/env python3
"""
╔═════════════════════════════════════════════════════════╗
║         FORENSIA - Simulacion Forense 2D                ║
║         Generado automaticamente con IA + Turtle        ║
╚═════════════════════════════════════════════════════════╝

Infraestructura: {scene.infraestructura}
Dictamen Tecnico:
{scene.dictamen}

Uso: python forensia_simulacion.py
Requiere: Python 3.x estandar (turtle incluido)
"""

import turtle
import time
import math


# ──────────────────────────────────────────
#  Datos de la simulacion (generados por IA)
# ──────────────────────────────────────────
INFRAESTRUCTURA = "{scene.infraestructura}"
FRAMES = [
{frames_str}
]

# ──────────────────────────────────────────
#  Configuracion de escena
# ──────────────────────────────────────────
SCALE = 8          # pixeles por metro
ANIM_DELAY = 0.05  # segundos entre steps interpolados
INTERP_STEPS = 30  # pasos de interpolacion entre frames

# ──────────────────────────────────────────
#  Setup de ventana
# ──────────────────────────────────────────
screen = turtle.Screen()
screen.title("FORENSIA - Simulacion Forense 2D")
screen.bgcolor("#0a0e1a")
screen.setup(width=900, height=700)
screen.tracer(0)   # control manual de actualizacion

# ──────────────────────────────────────────
#  Funciones de dibujo de infraestructura
# ──────────────────────────────────────────
def draw_road_line(t, x1, y1, x2, y2, color="#444444", width=1, dash=False):
    t.penup()
    t.goto(x1, y1)
    t.pendown()
    t.color(color)
    t.width(width)
    if dash:
        # Linea discontinua manual
        dx, dy = x2 - x1, y2 - y1
        dist = math.sqrt(dx**2 + dy**2)
        steps = int(dist / 10)
        for i in range(steps):
            frac0 = i / steps
            frac1 = (i + 0.5) / steps
            t.penup()
            t.goto(x1 + dx * frac0, y1 + dy * frac0)
            t.pendown()
            t.goto(x1 + dx * frac1, y1 + dy * frac1)
        t.penup()
    else:
        t.goto(x2, y2)
    t.penup()

def draw_infrastructure(t):
    t.speed(0)
    t.penup()
    road_color = "#1c1c1c"
    line_color = "#ffff00"
    edge_color = "#ffffff"
    road_w = 40  # semiancho de carretera en pixels

    if INFRAESTRUCTURA in ("interseccion_cruciforme", "interseccion"):
        # Fondo de asfalto horizontal
        t.goto(-300, -road_w)
        t.fillcolor(road_color)
        t.begin_fill()
        for dx, dy in [(600, 0), (0, road_w*2), (-600, 0), (0, -road_w*2)]:
            t.goto(t.xcor() + dx, t.ycor() + dy)
        t.end_fill()
        # Fondo de asfalto vertical
        t.goto(-road_w, -300)
        t.begin_fill()
        for dx, dy in [(road_w*2, 0), (0, 600), (-road_w*2, 0), (0, -600)]:
            t.goto(t.xcor() + dx, t.ycor() + dy)
        t.end_fill()
        # Lineas de borde
        for y in [-road_w, road_w]:
            draw_road_line(t, -300, y, -road_w, y, edge_color, 2)
            draw_road_line(t, road_w, y, 300, y, edge_color, 2)
        for x in [-road_w, road_w]:
            draw_road_line(t, x, -300, x, -road_w, edge_color, 2)
            draw_road_line(t, x, road_w, x, 300, edge_color, 2)
        # Lineas centrales discontinuas
        draw_road_line(t, -300, 0, -road_w, 0, line_color, 1, dash=True)
        draw_road_line(t, road_w, 0, 300, 0, line_color, 1, dash=True)
        draw_road_line(t, 0, -300, 0, -road_w, line_color, 1, dash=True)
        draw_road_line(t, 0, road_w, 0, 300, line_color, 1, dash=True)

    elif INFRAESTRUCTURA == "recta":
        t.goto(-400, -road_w)
        t.fillcolor(road_color)
        t.begin_fill()
        for dx, dy in [(800, 0), (0, road_w*2), (-800, 0), (0, -road_w*2)]:
            t.goto(t.xcor() + dx, t.ycor() + dy)
        t.end_fill()
        draw_road_line(t, -400, -road_w, 400, -road_w, edge_color, 2)
        draw_road_line(t, -400, road_w, 400, road_w, edge_color, 2)
        draw_road_line(t, -400, 0, 400, 0, line_color, 1, dash=True)

    elif INFRAESTRUCTURA == "rotonda":
        # Circulo de rotonda
        t.goto(0, -80)
        t.fillcolor(road_color)
        t.begin_fill()
        t.circle(80)
        t.end_fill()
        t.goto(0, -40)
        t.fillcolor("#0a0e1a")
        t.begin_fill()
        t.circle(40)
        t.end_fill()
        # Entradas
        for angle in [0, 90, 180, 270]:
            rad = math.radians(angle)
            x0 = 80 * math.cos(rad)
            y0 = 80 * math.sin(rad)
            x1 = 250 * math.cos(rad)
            y1 = 250 * math.sin(rad)
            nx, ny = -math.sin(rad) * road_w, math.cos(rad) * road_w
            t.goto(x0 + nx, y0 + ny)
            t.fillcolor(road_color)
            t.begin_fill()
            for px, py in [(x1 + nx, y1 + ny), (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)]:
                t.goto(px, py)
            t.goto(x0 + nx, y0 + ny)
            t.end_fill()

    else:  # curva
        t.goto(-300, -road_w)
        t.fillcolor(road_color)
        t.begin_fill()
        for dx, dy in [(200, 0), (100, 100), (0, 200), (0, road_w*2),
                       (-100, -200), (-200, -100), (0, -road_w*2)]:
            t.goto(t.xcor() + dx, t.ycor() + dy)
        t.end_fill()

def draw_point_of_impact(t):
    """Dibuja una X en el punto de impacto (0,0)."""
    t.penup()
    t.goto(-10, -10)
    t.pendown()
    t.color("#ff0000")
    t.width(3)
    t.goto(10, 10)
    t.penup()
    t.goto(10, -10)
    t.pendown()
    t.goto(-10, 10)
    t.penup()


def make_triangle(t, x, y, size, color):
    t.clear()
    t.penup()
    t.goto(x, y)
    t.setheading(90)
    t.pendown()
    t.fillcolor(color)
    t.color(color)
    t.begin_fill()
    for _ in range(3):
        t.forward(size)
        t.left(120)
    t.end_fill()
    t.penup()


# ──────────────────────────────────────────
#  Main
# ──────────────────────────────────────────
def main():
    screen = turtle.Screen()
    screen.title("FORENSIA - Simulacion Forense 2D")
    screen.bgcolor("#0a0e1a")
    screen.setup(width=900, height=700)
    screen.tracer(0)
    
    road_t = turtle.Turtle()
    road_t.speed(0)
    road_t.hideturtle()
    road_t.penup()
    
    impact_t = turtle.Turtle()
    impact_t.speed(0)
    impact_t.hideturtle()
    impact_t.penup()
    
    traj1_t = turtle.Turtle()
    traj1_t.speed(0)
    traj1_t.hideturtle()
    traj1_t.penup()
    traj1_t.width(1)
    
    traj2_t = turtle.Turtle()
    traj2_t.speed(0)
    traj2_t.hideturtle()
    traj2_t.penup()
    traj2_t.width(1)
    
    v1_t = turtle.Turtle()
    v1_t.speed(0)
    v1_t.hideturtle()
    
    v2_t = turtle.Turtle()
    v2_t.speed(0)
    v2_t.hideturtle()
    
    hud_t = turtle.Turtle()
    hud_t.speed(0)
    hud_t.hideturtle()
    hud_t.penup()
    
    draw_infrastructure(road_t)
    draw_point_of_impact(impact_t)
    draw_trajectory(traj1_t, FRAMES, "v1_x", "v1_y", "#e74c3c55")
    draw_trajectory(traj2_t, FRAMES, "v2_x", "v2_y", "#3498db55")
    screen.update()
    time.sleep(0.5)
    
    total_frames = len(FRAMES)
    total_time = FRAMES[-1]["t"] if FRAMES else 0
    
    for i in range(total_frames - 1):
        f0 = FRAMES[i]
        f1 = FRAMES[i + 1]
        for step in range(INTERP_STEPS + 1):
            frac = step / INTERP_STEPS
            t_now = lerp(f0["t"], f1["t"], frac)
            
            v1x = lerp(f0["v1_x"], f1["v1_x"], frac)
            v1y = lerp(f0["v1_y"], f1["v1_y"], frac)
            v1a = lerp_angle(f0["v1_a"], f1["v1_a"], frac)
            
            v2x = lerp(f0["v2_x"], f1["v2_x"], frac)
            v2y = lerp(f0["v2_y"], f1["v2_y"], frac)
            v2a = lerp_angle(f0["v2_a"], f1["v2_a"], frac)
            
            triangle_size = 30
            make_triangle(v1_t, v1x * SCALE, -v1y * SCALE, triangle_size, "#e74c3c")
            make_triangle(v2_t, v2x * SCALE, -v2y * SCALE, triangle_size, "#2980b9")
            
            screen.update()
            time.sleep(ANIM_DELAY)
    
    f_last = FRAMES[-1]
    triangle_size = 30
    make_triangle(v1_t, f_last["v1_x"] * SCALE, -f_last["v1_y"] * SCALE, triangle_size, "#e74c3c")
    make_triangle(v2_t, f_last["v2_x"] * SCALE, -f_last["v2_y"] * SCALE, triangle_size, "#2980b9")
    
    screen.update()
    turtle.done()


def lerp(a, b, frac):
    return a + (b - a) * frac

def lerp_angle(a, b, frac):
    diff = (b - a + 180) % 360 - 180
    return a + diff * frac


def draw_trajectory(t, frames_data, key_x, key_y, color):
    t.clear()
    t.color(color)
    t.width(1)
    t.penup()
    first = True
    for f in frames_data:
        px = f[key_x] * SCALE
        py = -f[key_y] * SCALE
        if first:
            t.goto(px, py)
            t.pendown()
            first = False
        else:
            t.goto(px, py)
    t.penup()


def get_phase(t_val):
    t_impact = FRAMES[len(FRAMES)//2]["t"] if len(FRAMES) > 1 else 0
    if t_val < t_impact - 0.1:
        return "PRE-IMPACTO"
    elif t_val <= t_impact + 0.1:
        return "IMPACTO"
    else:
        return "POST-IMPACTO"    '''
