from dataclasses import dataclass
from typing import List, Dict, Any
from enum import Enum
import math
@dataclass
class Vehicle:
    """Modela un vehículo para la simulación forense."""
    
    # Datos de movimiento
    x: float = 0.0
    y: float = 0.0
    angle: float = 0.0
    name: str = ""
    
    # Propiedades visuales
    color: str = "#e74c3c"
    width: float = 20.0
    length: float = 40.0
    
    # Estados
    is_moving: bool = True
    trajectory: List[Dict[str, float]] = None
    
    def __post_init__(self):
        if self.trajectory is None:
            self.trajectory = []
    
    def update_position(self, x: float, y: float, angle: float, timestamp: float):
        """Actualiza la posición del vehículo y guarda en el historial."""
        self.x = x
        self.y = y
        self.angle = angle
        self.trajectory.append({
            'x': x,
            'y': y,
            'angle': angle,
            'timestamp': timestamp
        })
    
    def get_display_position(self, scale: float = 8.0, y_flipped: bool = True):
        """Obtiene las coordenadas para visualización."""
        px = self.x * scale
        py = self.y * scale
        if y_flipped:
            py = -py
        return px, py
    
    def calculate_heading(self, reference_system: str = "nort-up"):
        """Calcula el ángulo de heading para renderizado.
        
        Args:
            reference_system: "nort-up" donde 0 = norte, "turtle" para coords turtle
        """
        if reference_system == "turtle":
            return 90 - self.angle
        return self.angle
    
    def draw(self, turtle_obj, scale: float = 8.0, y_flipped: bool = True):
        """Dibuja el vehículo usando turtle."""
        px, py = self.get_display_position(scale, y_flipped)
        heading = self.calculate_heading("turtle")
        
        turtle_obj.clear()
        turtle_obj.penup()
        turtle_obj.goto(px, py)
        turtle_obj.setheading(heading)
        
        turtle_obj.fillcolor(self.color)
        turtle_obj.color(self.color)
        turtle_obj.begin_fill()
        
        half_w, half_l = self.width / 2, self.length / 2
        corners = [
            (-half_w, -half_l),
            (half_w, -half_l),
            (half_w, half_l),
            (-half_w, half_l)
        ]
        
        for corner in corners:
            turtle_obj.goto(px + corner[0], py + corner[1])
        
        turtle_obj.end_fill()
        turtle_obj.penup()
        
        if self.name:
            turtle_obj.goto(px, py + half_l + 8)
            turtle_obj.color("#ffffff")
            turtle_obj.write(self.name, align="center", font=("Arial", 10, "bold"))
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any], name: str = ""):
        """Crea un vehículo a partir de un diccionario (desde AI)."""
        return cls(
            x=data.get('v1_x', data.get('x', 0.0)),
            y=data.get('v1_y', data.get('y', 0.0)),
            angle=data.get('v1_angulo', data.get('angulo', 0.0)),
            name=name,
            color="#e74c3c" if name == "V1" else "#2980b9" if name == "V2" else data.get('color', "#e74c3c"),
        )
@dataclass
class ImpactEvent:
    """Representa un evento de impacto entre vehículos."""
    
    timestamp: float = 0.0
    position: Dict[str, float] = None
    vehicles: List[Vehicle] = None
    energy_dissipated: float = 0.0
    
    def __post_init__(self):
        if self.position is None:
            self.position = {'x': 0.0, 'y': 0.0}
        if self.vehicles is None:
            self.vehicles = []
@dataclass
class Scene:
    """Representa una escena completa de reconstrucción forense."""
    
    infrastructure: str = "interseccion_cruciforme"
    vehicles: List[Vehicle] = None
    impact_event: ImpactEvent = None
    frames: List[Dict[str, Any]] = None
    dictamen: str = ""
    
    def __post_init__(self):
        if self.vehicles is None:
            self.vehicles = []
        if self.frames is None:
            self.frames = []
    
    def add_vehicle(self, vehicle: Vehicle):
        """Agrega un vehículo a la escena."""
        self.vehicles.append(vehicle)
    
    def set_impact_event(self, impact_event: ImpactEvent):
        """Establece el evento de impacto."""
        self.impact_event = impact_event
    
    def get_vehicle_by_name(self, name: str) -> Vehicle:
        """Obtiene un vehículo por su nombre."""
        for vehicle in self.vehicles:
            if vehicle.name == name:
                return vehicle
        return None
    
    def get_actors_data(self) -> List[Dict[str, Any]]:
        """Obtiene los datos de actores para la animación (formato AI)."""
        actors = []
        for frame in self.frames:
            frame_data = {
                'segundo': frame.get('timestamp', frame.get('segundo', 0.0))
            }
            
            if 'v1_x' in frame:
                frame_data['v1_x'] = frame['v1_x']
                frame_data['v1_y'] = frame['v1_y']
                frame_data['v1_angulo'] = frame['v1_angulo']
                frame_data['v2_x'] = frame.get('v2_x', 0.0)
                frame_data['v2_y'] = frame.get('v2_y', 0.0)
                frame_data['v2_angulo'] = frame.get('v2_angulo', 0.0)
            else:
                for i, vehicle in enumerate(self.vehicles):
                    frame_data[f'v{i+1}_x'] = vehicle.x
                    frame_data[f'v{i+1}_y'] = vehicle.y
                    frame_data[f'v{i+1}_angulo'] = vehicle.angle
            
            actors.append(frame_data)
        
        return actors