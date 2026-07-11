<?php
/**
 * ForensIA - Controller: /api/turtle-script
 * ==========================================
 * Recibe el payload de una simulación y devuelve un script Python (Turtle)
 * descargable que el usuario puede ejecutar localmente para ver la escena
 * forense 2D.
 *
 * Entrada (JSON body): el mismo payload que devuelve /api/simulate.
 *
 * Salida: text/plain (forensia_simulacion.py)
 */

require_once __DIR__ . '/../lib/TurtleBuilder.php';

header('Content-Type: text/plain; charset=utf-8');
header('Content-Disposition: attachment; filename="forensia_simulacion.py"');

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);

if (!is_array($body) || !isset($body['animacion_actores'])) {
    http_response_code(400);
    echo "# ERROR: body inválido. Se esperaba el JSON de la simulación.";
    return;
}

try {
    $script = buildTurtleScript($body);
    echo $script;
} catch (Throwable $e) {
    http_response_code(500);
    echo "# ERROR generando el script: " . $e->getMessage();
}
