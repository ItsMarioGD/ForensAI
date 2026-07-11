<?php
/**
 * ForensIA - Router de API (XAMPP / PHP)
 * ======================================
 * Punto de entrada único para los endpoints usados por el frontend:
 *   GET  /api/status          -> controllers/StatusController.php
 *   GET  /api/models          -> controllers/ModelsController.php
 *   POST /api/simulate        -> controllers/SimulateController.php
 *   POST /api/turtle-script   -> controllers/TurtleController.php
 *
 * Requiere Apache con mod_rewrite para enviar todo /api/* a este archivo
 * (ver .htaccess en esta misma carpeta).
 */

require_once __DIR__ . '/../config.php';

// ── CORS (permite que el frontend en el mismo host o externo consuma la API) ──
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Resolver el endpoint a partir de la URL ──
// REQUEST_URI típico: /api/status  o  /forensia/api/simulate
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
$uri = rtrim($uri, '/');
$endpoint = '';
if (preg_match('#/api/([^/]+)$#', $uri, $m)) {
    $endpoint = $m[1];
}

switch ($endpoint) {
    case 'status':
        require __DIR__ . '/../controllers/StatusController.php';
        break;

    case 'models':
        require __DIR__ . '/../controllers/ModelsController.php';
        break;

    case 'simulate':
        require __DIR__ . '/../controllers/SimulateController.php';
        break;

    case 'turtle-script':
        require __DIR__ . '/../controllers/TurtleController.php';
        break;

    default:
        http_response_code(404);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(
            ['error' => "Endpoint no encontrado: /api/{$endpoint}"],
            JSON_UNESCAPED_UNICODE
        );
}

exit;
