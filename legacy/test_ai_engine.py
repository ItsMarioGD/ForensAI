from ai_engine import SYSTEM_PROMPT, _validate_payload

print('=== TESTING AI ENGINE ===')
print('System prompt contains key elements:')
print('  - vehicle_model:', 'vehicle_model' in SYSTEM_PROMPT)
print('  - physics_engine:', 'physics_engine' in SYSTEM_PROMPT)
print('  - part_detachment:', 'part_detachment' in SYSTEM_PROMPT)
print('  - tire_marks:', 'tire_marks' in SYSTEM_PROMPT)
print('  - smooth_shading:', 'smooth_shading' in SYSTEM_PROMPT)
print('  - environment:', 'environment' in SYSTEM_PROMPT)
print('  - lighting_engine:', 'lighting_engine' in SYSTEM_PROMPT)

# Test validation
test_payload = {
    'infraestructura': 'interseccion_cruciforme',
    'dictamen_tecnico': 'Test accident',
    'v1_color': 'rojo',
    'v2_color': 'azul',
    'v1_tipo': 'sedan',
    'v2_tipo': 'suv',
    'vehicle_model': 'high_poly',
    'smooth_shading': True,
    'environment': 'urban',
    'lighting_engine': 'daylight',
    'physics_engine': 'advanced',
    'part_detachment': True,
    'tire_marks': True,
    'animacion_actores': [
        {'segundo': 0.0, 'v1_x': -20.0, 'v1_y': 0.0, 'v1_angulo': 90, 'v2_x': 0.0, 'v2_y': -20.0, 'v2_angulo': 0},
        {'segundo': 1.0, 'v1_x': 0.0, 'v1_y': 0.0, 'v1_angulo': 90, 'v2_x': 0.0, 'v2_y': 0.0, 'v2_angulo': 0},
        {'segundo': 2.5, 'v1_x': 5.0, 'v1_y': -2.0, 'v1_angulo': 45, 'v2_x': 2.0, 'v2_y': 8.0, 'v2_angulo': 15}
    ]
}

result = _validate_payload(test_payload)
print('  - Validation test:', 'PASS' if result else 'FAIL')
print()
print('=== READY FOR FORENSIA ENGINE ===')