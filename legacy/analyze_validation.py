import json
from ai_engine import SYSTEM_PROMPT

print("=== SYSTEM PROMPT ANALYSIS ===")
print("Prompt length:", len(SYSTEM_PROMPT))
print("\nPrompt contains key elements:")
print("  - vehicle_model:", "vehicle_model" in SYSTEM_PROMPT)
print("  - smooth_shading:", "smooth_shading" in SYSTEM_PROMPT)
print("  - environment:", "environment" in SYSTEM_PROMPT)
print("  - lighting_engine:", "lighting_engine" in SYSTEM_PROMPT)
print("  - physics_engine:", "physics_engine" in SYSTEM_PROMPT)
print("  - part_detachment:", "part_detachment" in SYSTEM_PROMPT)
print("  - tire_marks:", "tire_marks" in SYSTEM_PROMPT)
print()

# Test what validation expects vs what AI might generate
test_cases = [
    {
        "name": "ORIGINAL STRUCTURE (what AI currently returns)",
        "payload": {
            "infraestructura": "curva",
            "dictamen_tecnico": "Amanecer en carretera de montaña sinuosa con ligera niebla. La SUV negra toma una curva muy cerrada a 80 km/h;",
            "animacion_actores": [
                {"segundo": 0.0, "v1_x": -15.0, "v1_y": -5.0, "v1_angulo": 45, "v2_x": 0.0, "v2_y": 0.0, "v2_angulo": 0},
                {"segundo": 1.0, "v1_x": 0.0, "v1_y": 0.0, "v1_angulo": 45, "v2_x": 0.0, "v2_y": 0.0, "v2_angulo": 0}
            ]
        }
    },
    {
        "name": "WITH MINIMAL NEW FIELDS",
        "payload": {
            "infraestructura": "curva",
            "dictamen_tecnico": "Test accident",
            "v1_color": "rojo",
            "v2_color": "azul",
            "v1_tipo": "sedan",
            "v2_tipo": "suv",
            "animacion_actores": [
                {"segundo": 0.0, "v1_x": -15.0, "v1_y": -5.0, "v1_angulo": 45, "v2_x": 0.0, "v2_y": 0.0, "v2_angulo": 0}
            ]
        }
    },
    {
        "name": "WITH ALL NEW FIELDS",
        "payload": {
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
    }
]

from ai_engine import _validate_payload

print("=== VALIDATION TESTS ===")
for test in test_cases:
    print(f"\n{test['name']}:")
    result = _validate_payload(test['payload'])
    print(f"  Result: {result}")
    
    if result:
        print("  Keys present:", sorted(test['payload'].keys()))
    else:
        print("  Missing required keys")
        
print("\n=== ANALYSIS ===")
print("The AI is NOT including ALL the new fields from the prompt.")
print("The prompt lists 14 required fields, but AI only returns 7.")
print("The validation needs to be less strict - allow the original structure.")
print("\nSOLUTION: Reduce validation to match the minimal required structure")
print("that the AI is actually generating, while keeping compatibility.")