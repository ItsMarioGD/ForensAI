from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
import sys
from pathlib import Path

# Permitir imports del paquete utils/
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

app = FastAPI(title="ForensIA API", version="2.0.0")

# Habilitar CORS completo para el frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SimulationRequest(BaseModel):
    relato: str
    model: str = DEFAULT_MODEL
    base_url: str = "http://localhost:11434"


@app.get("/api/status")
def get_status():
    is_running = check_ollama_running()
    return {"ollama_running": is_running}


@app.get("/api/models")
def get_models():
    models = list_local_models()
    model_names = [m.get("name", "") for m in models]
    return {
        "installed": model_names,
        "recommended": RECOMMENDED_MODELS,
        "default": DEFAULT_MODEL
    }


@app.post("/api/simulate")
def simulate(req: SimulationRequest):
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
    try:
        animacion = payload.get("animacion_actores", [])
        infraestructura = payload.get("infraestructura", "interseccion_cruciforme")
        dictamen = payload.get("dictamen_tecnico", "")

        script = _build_turtle_script(animacion, infraestructura, dictamen)
        return PlainTextResponse(content=script, media_type="text/plain")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _build_turtle_script(animacion: list, infraestructura: str, dictamen: str) -> str:
    """Genera el codigo Python completo con Turtle para la simulacion 2D."""

    frames_code = []
    for frame in animacion:
        frames_code.append(
            f"    {{'t': {frame['segundo']}, "
            f"'v1_x': {frame['v1_x']}, 'v1_y': {frame['v1_y']}, 'v1_a': {frame['v1_angulo']}, "
            f"'v2_x': {frame['v2_x']}, 'v2_y': {frame['v2_y']}, 'v2_a': {frame['v2_angulo']}}},"
        )

    frames_str = "\n".join(frames_code)

    script = f'''#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════╗
║         FORENSIA - Simulacion Forense 2D                ║
║         Generado automaticamente con IA + Turtle        ║
╚══════════════════════════════════════════════════════════╝

Infraestructura: {infraestructura}
Dictamen Tecnico:
{dictamen}

Uso: python forensia_simulacion.py
Requiere: Python 3.x estandar (turtle incluido)
"""

import turtle
import time
import math


# ──────────────────────────────────────────
#  Datos de la simulacion (generados por IA)
# ──────────────────────────────────────────
INFRAESTRUCTURA = "{infraestructura}"
FRAMES = [
{frames_str}
]

# ──────────────────────────────────────────
#  Configuracion de escena
# ──────────────────────────────────────────
SCALE = 8          # pixeles por metro
ANIM_DELAY = 0.05  # segundos entre steps interpolados
INTERP_STEPS = 30  # pasos de interpolacion entre frames
VEH_W = 10         # ancho del vehiculo en pixels
VEH_L = 20         # largo del vehiculo en pixels

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

# ──────────────────────────────────────────
#  Turtle para cada vehiculo
# ──────────────────────────────────────────
def make_vehicle_turtle(color, label):
    t = turtle.Turtle()
    t.speed(0)
    t.hideturtle()
    t.penup()
    return t

def draw_vehicle(t, x, y, angle_deg, color, label):
    """Dibuja un rectangulo orientado que representa el vehiculo."""
    t.clear()
    t.penup()

    # Convertir coordenadas de mundo a pixels (escala + Y invertido)
    px = x * SCALE
    py = -y * SCALE  # Y invertido en turtle (norte es positivo en mundo, negativo en screen)

    # Angulo: 0=norte, 90=este → turtle: 90=este, 0=este nativo
    heading = 90 - angle_deg  # convertir a sistema turtle

    # Calcular esquinas del rectangulo
    rad = math.radians(heading)
    cos_a, sin_a = math.cos(rad), math.sin(rad)

    corners = [
        (-VEH_W/2, -VEH_L/2),
        ( VEH_W/2, -VEH_L/2),
        ( VEH_W/2,  VEH_L/2),
        (-VEH_W/2,  VEH_L/2),
    ]
    world_corners = [
        (px + cx * cos_a - cy * sin_a, py + cx * sin_a + cy * cos_a)
        for cx, cy in corners
    ]

    # Rellenar cuerpo
    t.fillcolor(color)
    t.color(color)
    t.goto(world_corners[0])
    t.pendown()
    t.begin_fill()
    for wc in world_corners[1:]:
        t.goto(wc)
    t.goto(world_corners[0])
    t.end_fill()
    t.penup()

    # Etiqueta
    t.goto(px, py + VEH_L/2 + 8)
    t.color("#ffffff")
    t.write(label, align="center", font=("Arial", 10, "bold"))
    t.penup()

def draw_trajectory(t, frames_data, key_x, key_y, color):
    """Dibuja la trayectoria completa del vehiculo."""
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

# ──────────────────────────────────────────
#  Turtle para UI / HUD
# ──────────────────────────────────────────
def draw_hud(hud, t_current, total_t, phase):
    hud.clear()
    hud.penup()
    hud.goto(-430, 320)
    hud.color("#38bdf8")
    hud.write("FORENSIA · Reconstruccion Forense 2D", font=("Arial", 13, "bold"))
    hud.goto(-430, 300)
    hud.color("#94a3b8")
    hud.write(f"Infraestructura: {INFRAESTRUCTURA}  |  t = {{t_current:.2f}}s / {{total_t:.2f}}s  |  Fase: {{phase}}", font=("Arial", 9, "normal"))
    # Leyenda
    hud.goto(-430, -310)
    hud.color("#e74c3c"); hud.write("■ Vehiculo 1 (V1)", font=("Arial", 9, "bold"))
    hud.goto(-270, -310)
    hud.color("#3498db"); hud.write("■ Vehiculo 2 (V2)", font=("Arial", 9, "bold"))
    hud.goto(50, -310)
    hud.color("#ff0000"); hud.write("✕ Punto de impacto", font=("Arial", 9, "bold"))

# ──────────────────────────────────────────
#  Interpolacion
# ──────────────────────────────────────────
def lerp(a, b, frac):
    return a + (b - a) * frac

def lerp_angle(a, b, frac):
    diff = (b - a + 180) % 360 - 180
    return a + diff * frac

def get_phase(t_val):
    t_impact = FRAMES[len(FRAMES)//2]["t"] if len(FRAMES) > 1 else 0
    if t_val < t_impact - 0.1:
        return "PRE-IMPACTO"
    elif t_val <= t_impact + 0.1:
        return "IMPACTO"
    else:
        return "POST-IMPACTO"

# ──────────────────────────────────────────
#  Main
# ──────────────────────────────────────────
def main():
    # Turtles de infraestructura (no se borran)
    road_t = turtle.Turtle()
    road_t.speed(0)
    road_t.hideturtle()
    road_t.penup()

    impact_t = turtle.Turtle()
    impact_t.speed(0)
    impact_t.hideturtle()
    impact_t.penup()

    # Turtles de trayectoria
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

    # Turtles de vehiculos
    v1_t = turtle.Turtle()
    v1_t.speed(0)
    v1_t.hideturtle()

    v2_t = turtle.Turtle()
    v2_t.speed(0)
    v2_t.hideturtle()

    # HUD
    hud_t = turtle.Turtle()
    hud_t.speed(0)
    hud_t.hideturtle()
    hud_t.penup()

    # Dibujar infraestructura (solo una vez)
    draw_infrastructure(road_t)
    draw_point_of_impact(impact_t)
    draw_trajectory(traj1_t, FRAMES, "v1_x", "v1_y", "#e74c3c55")
    draw_trajectory(traj2_t, FRAMES, "v2_x", "v2_y", "#3498db55")
    screen.update()
    time.sleep(0.5)

    # Animacion con interpolacion entre frames
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

            draw_vehicle(v1_t, v1x, v1y, v1a, "#e74c3c", "V1")
            draw_vehicle(v2_t, v2x, v2y, v2a, "#2980b9", "V2")
            draw_hud(hud_t, t_now, total_time, get_phase(t_now))
            screen.update()
            time.sleep(ANIM_DELAY)

    # Frame final
    f_last = FRAMES[-1]
    draw_vehicle(v1_t, f_last["v1_x"], f_last["v1_y"], f_last["v1_a"], "#e74c3c", "V1")
    draw_vehicle(v2_t, f_last["v2_x"], f_last["v2_y"], f_last["v2_a"], "#2980b9", "V2")
    draw_hud(hud_t, f_last["t"], total_time, "REPOSO FINAL")
    screen.update()

    # Mensaje final
    hud_t.goto(0, 0)
    hud_t.color("#10b981")
    hud_t.write("Simulacion completada. Cierra la ventana para salir.", align="center", font=("Arial", 12, "bold"))
    screen.update()
    turtle.done()

if __name__ == "__main__":
    main()
'''
    return script


# Montar frontend estático al final para no sobreescribir las rutas de API
FRONTEND_DIR = PROJECT_ROOT / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
