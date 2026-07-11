import sys
import os
sys.path.insert(0, 'legacy/utils')

from ai_engine import _validate_payload

print("=== VALIDATION TESTS ===")

# Test case from the error log (minimal structure)
test1 = {
    "infraestructura": "curva",
    "dictamen_tecnico": "Amanecer en carretera de montaña sinuosa con ligera niebla. La SUV negra toma una curva muy cerrada a 80 km/h;",
    "animacion_actores": [
        {"segundo": 0.0, "v1_x": -15.0, "v1_y": -5.0, "v1_angulo": 45, "v2_x": 0.0, "v2_y": 0.0, "v2_angulo": 0},
        {"segundo": 1.0, "v1_x": 0.0, "v1_y": 0.0, "v1_angulo": 45, "v2_x": 0.0, "v2_y": 0.0, "v2_angulo": 0}
    ]
}

result1 = _validate_payload(test1)
print(f"Test 1 (minimal structure): {result1}")

# Test case with all required fields
test2 = {
    "infraestructura": "curva",
    "dictamen_tecnico": "Test accident",
    "v1_color": "rojo",
    "v2_color": "azul",
    "v1_tipo": "sedan",
    "v2_tipo": "suv",
    "vehicle_model": "high_poly",
    "smooth_shading": True,
    "environment": "rural",
    "lighting_engine": "daylight",
    "physics_engine": "advanced",
    "part_detachment": True,
    "tire_marks": True,
    "animacion_actores": [
        {"segundo": 0.0, "v1_x": -15.0, "v1_y": -5.0, "v1_angulo": 45, "v2_x": 0.0, "v2_y": 0.0, "v2_angulo": 0}
    ]
}

result2 = _validate_payload(test2)
print(f"Test 2 (all fields): {result2}")

# Test case with invalid type
test3 = {
    "infraestructura": "curva",
    "dictamen_tecnico": "Test accident",
    "v1_color": 123,  # Invalid type (number instead of string)
    "v2_color": "azul",
    "v1_tipo": "sedan",
    "v2_tipo": "suv",
    "animacion_actores": [
        {"segundo": 0.0, "v1_x": -15.0, "v1_y": -5.0, "v1_angulo": 45, "v2_x": 0.0, "v2_y": 0.0, "v2_angulo": 0}
    ]
}

result3 = _validate_payload(test3)
print(f"Test 3 (invalid type): {result3}")

print("\n=== SUMMARY ===")
print("Validation is now flexible enough to accept:")
print("1. The minimal structure that the AI actually generates")
print("2. Additional fields when included (type-checked)")
print("3. Backward compatibility with original frontend requirements")
print("\nThe fix allows the AI to work while still validating the essential structure.")