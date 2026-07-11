<?php
/**
 * ForensIA - Generador de script Turtle (Python)
 * ==============================================
 * Puerto de las funciones:
 *   - utils.vehicles.Vehicle / ImpactEvent / Scene (clases)
 *   - api.main._build_scene_from_payload
 *   - api.main._build_turtle_script_from_scene
 *
 * El script Python generado es un ARTEFACTO descargable (text/plain) — el
 * servidor NO lo ejecuta, el usuario lo corre localmente con:
 *   python forensia_simulacion.py
 *
 * Mantenemos paridad byte-a-byte con el original: misma plantilla, mismo
 * f-string de Python, mismos helpers de dibujo.
 */

// ─────────────────────────────────────────────────────────────────────────
//  Clases equivalentes a las dataclasses de utils/vehicles.py
// ─────────────────────────────────────────────────────────────────────────

class Vehicle {
    public float $x = 0.0;
    public float $y = 0.0;
    public float $angle = 0.0;
    public string $name = '';
    public string $color = '#e74c3c';
    public float $width = 20.0;
    public float $length = 40.0;
    public bool $isMoving = true;
    public array $trajectory = [];

    public function __construct(
        float $x = 0.0,
        float $y = 0.0,
        float $angle = 0.0,
        string $name = '',
        string $color = '#e74c3c',
        float $width = 20.0,
        float $length = 40.0,
        bool $isMoving = true,
        array $trajectory = []
    ) {
        $this->x = $x;
        $this->y = $y;
        $this->angle = $angle;
        $this->name = $name;
        $this->color = $color;
        $this->width = $width;
        $this->length = $length;
        $this->isMoving = $isMoving;
        $this->trajectory = $trajectory;
    }

    public function updatePosition(float $x, float $y, float $angle, float $timestamp): void {
        $this->x = $x;
        $this->y = $y;
        $this->angle = $angle;
        $this->trajectory[] = [
            'x' => $x,
            'y' => $y,
            'angle' => $angle,
            'timestamp' => $timestamp,
        ];
    }

    public function getDisplayPosition(float $scale = 8.0, bool $yFlipped = true): array {
        $px = $this->x * $scale;
        $py = $this->y * $scale;
        if ($yFlipped) {
            $py = -$py;
        }
        return [$px, $py];
    }

    public function calculateHeading(string $referenceSystem = 'north-up'): float {
        if ($referenceSystem === 'turtle') {
            return 90 - $this->angle;
        }
        return $this->angle;
    }

    /**
     * Crea un vehículo a partir de un dict (formato de la IA).
     */
    public static function fromDict(array $data, string $name = ''): self {
        $color = '#e74c3c';
        if ($name === 'V2') {
            $color = '#2980b9';
        } elseif (isset($data['color']) && is_string($data['color'])) {
            $color = $data['color'];
        }

        return new self(
            (float) ($data['v1_x'] ?? $data['x'] ?? 0.0),
            (float) ($data['v1_y'] ?? $data['y'] ?? 0.0),
            (float) ($data['v1_angulo'] ?? $data['angulo'] ?? 0.0),
            $name,
            $color
        );
    }
}

class ImpactEvent {
    public float $timestamp = 0.0;
    public array $position = ['x' => 0.0, 'y' => 0.0];
    public array $vehicles = [];
    public float $energyDissipated = 0.0;

    public function __construct(
        float $timestamp = 0.0,
        array $position = ['x' => 0.0, 'y' => 0.0],
        array $vehicles = [],
        float $energyDissipated = 0.0
    ) {
        $this->timestamp = $timestamp;
        $this->position = $position;
        $this->vehicles = $vehicles;
        $this->energyDissipated = $energyDissipated;
    }
}

class Scene {
    public string $infraestructura = 'interseccion_cruciforme';
    public array $vehicles = [];
    public ?ImpactEvent $impactEvent = null;
    public array $frames = [];
    public string $dictamen = '';

    public function __construct(
        string $infraestructura = 'interseccion_cruciforme',
        array $vehicles = [],
        ?ImpactEvent $impactEvent = null,
        array $frames = [],
        string $dictamen = ''
    ) {
        $this->infraestructura = $infraestructura;
        $this->vehicles = $vehicles;
        $this->impactEvent = $impactEvent;
        $this->frames = $frames;
        $this->dictamen = $dictamen;
    }

    public function addVehicle(Vehicle $v): void {
        $this->vehicles[] = $v;
    }

    public function setImpactEvent(ImpactEvent $e): void {
        $this->impactEvent = $e;
    }

    public function getVehicleByName(string $name): ?Vehicle {
        foreach ($this->vehicles as $v) {
            if ($v->name === $name) {
                return $v;
            }
        }
        return null;
    }

    /**
     * Convierte los frames al formato que espera el script Python.
     * (Mantiene el campo 'segundo' en lugar de 'timestamp' para
     *  compatibilidad con el f-string generado.)
     */
    public function getActorsData(): array {
        $actors = [];
        foreach ($this->frames as $frame) {
            $data = [
                'segundo' => $frame['timestamp'] ?? $frame['segundo'] ?? 0.0,
            ];

            if (array_key_exists('v1_x', $frame)) {
                $data['v1_x'] = $frame['v1_x'];
                $data['v1_y'] = $frame['v1_y'];
                $data['v1_angulo'] = $frame['v1_angulo'];
                $data['v2_x'] = $frame['v2_x'] ?? 0.0;
                $data['v2_y'] = $frame['v2_y'] ?? 0.0;
                $data['v2_angulo'] = $frame['v2_angulo'] ?? 0.0;
            } else {
                // Fallback: posición de los vehículos en la escena
                foreach ($this->vehicles as $i => $v) {
                    $data["v" . ($i + 1) . "_x"] = $v->x;
                    $data["v" . ($i + 1) . "_y"] = $v->y;
                    $data["v" . ($i + 1) . "_angulo"] = $v->angle;
                }
            }

            $actors[] = $data;
        }
        return $actors;
    }
}

// ─────────────────────────────────────────────────────────────────────────
//  Construcción de la escena a partir del payload
// ─────────────────────────────────────────────────────────────────────────

function buildSceneFromPayload(array $payload): Scene {
    $scene = new Scene(
        $payload['infraestructura'] ?? 'interseccion_cruciforme',
        [],
        null,
        [],
        $payload['dictamen_tecnico'] ?? ''
    );

    $frames = $payload['animacion_actores'] ?? [];

    // Solo V1 y V2 (los dos primeros frames representan los vehículos)
    foreach (array_slice($frames, 0, 2) as $i => $frame) {
        $name = 'V' . ($i + 1);
        $vehicle = Vehicle::fromDict($frame, $name);
        $scene->addVehicle($vehicle);

        $scene->frames[] = [
            'timestamp' => $frame['segundo'] ?? 0.0,
            'v1_x' => $frame['v1_x'] ?? 0.0,
            'v1_y' => $frame['v1_y'] ?? 0.0,
            'v1_angulo' => $frame['v1_angulo'] ?? 0.0,
            'v2_x' => $frame['v2_x'] ?? 0.0,
            'v2_y' => $frame['v2_y'] ?? 0.0,
            'v2_angulo' => $frame['v2_angulo'] ?? 0.0,
        ];
    }

    // Evento de impacto en el frame del segundo crítico (el del medio)
    if (!empty($frames)) {
        $impactTime = $frames[intdiv(count($frames), 2)]['segundo'] ?? 0.0;
        $scene->setImpactEvent(new ImpactEvent(
            $impactTime,
            ['x' => 0.0, 'y' => 0.0],
            $scene->vehicles
        ));
    }

    return $scene;
}

// ─────────────────────────────────────────────────────────────────────────
//  Plantilla del script Python (idéntica a api/main.py original)
// ─────────────────────────────────────────────────────────────────────────

const TURTLE_SCRIPT_TEMPLATE = <<<'PYTHON'
#!/usr/bin/env python3
"""
╔═════════════════════════════════════════════════════════╗
║         FORENSIA - Simulacion Forense 2D                ║
║         Generado automaticamente con IA + Turtle        ║
╚═════════════════════════════════════════════════════════╝

Infraestructura: __INFRAESTRUCTURA__
Dictamen Tecnico:
__DICTAMEN__

Uso: python forensia_simulacion.py
Requiere: Python 3.x estandar (turtle incluido)
"""

import turtle
import time
import math


# ──────────────────────────────────────────
#  Datos de la simulacion (generados por IA)
# ──────────────────────────────────────────
INFRAESTRUCTURA = "__INFRAESTRUCTURA__"
FRAMES = [
__FRAMES__
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
        return "POST-IMPACTO"


if __name__ == "__main__":
    main()
PYTHON;

// ─────────────────────────────────────────────────────────────────────────
//  Generador principal
// ─────────────────────────────────────────────────────────────────────────

/**
 * Genera el script Python (texto) listo para descargar.
 *
 * @param array $payload Payload de simulación.
 * @return string Script Python completo.
 */
function buildTurtleScript(array $payload): string {
    $scene = buildSceneFromPayload($payload);
    $frames = $scene->getActorsData();

    $framesCode = [];
    foreach ($frames as $f) {
        $framesCode[] = sprintf(
            "    {'t': %s, 'v1_x': %s, 'v1_y': %s, 'v1_a': %s, 'v2_x': %s, 'v2_y': %s, 'v2_a': %s},",
            $f['segundo'],
            $f['v1_x'],
            $f['v1_y'],
            $f['v1_angulo'],
            $f['v2_x'],
            $f['v2_y'],
            $f['v2_angulo']
        );
    }
    $framesStr = implode("\n", $framesCode);

    $infra = $scene->infraestructura;
    $dictamen = $scene->dictamen;

    // Sanitizar comillas dobles en dictamen e infraestructura para evitar
    // romper el literal de Python.
    $infraSafe = str_replace('"', '\\"', $infra);
    $dictamenSafe = str_replace('"', '\\"', $dictamen);

    $script = TURTLE_SCRIPT_TEMPLATE;
    $script = str_replace('__INFRAESTRUCTURA__', $infraSafe, $script);
    $script = str_replace('__DICTAMEN__', $dictamenSafe, $script);
    $script = str_replace('__FRAMES__', $framesStr, $script);

    return $script;
}
