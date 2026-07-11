<?php
/**
 * ForensIA - Front-controller (XAMPP / PHP)
 * =========================================
 * Único punto de entrada. Maneja dos cosas:
 *   1) API REST  -> /api/status, /api/models, /api/simulate, /api/turtle-script
 *   2) Frontend  -> sirve los archivos de /frontend (index.html, app.js, styles.css)
 *
 * El .htaccess envía aquí todas las peticiones que no sean archivos reales,
 * de modo que funciona aunque mod_rewrite esté limitado.
 */

require_once __DIR__ . '/config.php';

// ── CORS ──
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── ¿Es una petición de API? ──
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
$uri = rtrim($uri, '/');
$apiEndpoint = null;
if (preg_match('#/api/([^/]+)$#', $uri, $m)) {
    $apiEndpoint = $m[1];
}

if ($apiEndpoint !== null) {
    switch ($apiEndpoint) {
        case 'status':
            require __DIR__ . '/controllers/StatusController.php';
            break;
        case 'models':
            require __DIR__ . '/controllers/ModelsController.php';
            break;
        case 'simulate':
            require __DIR__ . '/controllers/SimulateController.php';
            break;
        case 'turtle-script':
            require __DIR__ . '/controllers/TurtleController.php';
            break;
        default:
            http_response_code(404);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => "Endpoint no encontrado: /api/{$apiEndpoint}"], JSON_UNESCAPED_UNICODE);
    }
    exit;
}

// ── Servir el frontend ──
$scriptDir = dirname($_SERVER['SCRIPT_NAME']);   // ej. /xamppuyect
$rel = $uri;
if ($scriptDir !== '/' && strpos($rel, $scriptDir) === 0) {
    $rel = substr($rel, strlen($scriptDir));
}
$rel = ltrim($rel, '/');
$rel = $rel === '' ? 'index.html' : $rel;

$target = __DIR__ . '/frontend/' . $rel;
if (!is_file($target)) {
    $target = __DIR__ . '/vendor/' . $rel;
}
if (!is_file($target)) {
    $target = __DIR__ . '/' . $rel;
}
if (is_file($target)) {
    $ext = pathinfo($target, PATHINFO_EXTENSION);
    $mime = [
        'html' => 'text/html; charset=utf-8',
        'js'   => 'application/javascript; charset=utf-8',
        'css'  => 'text/css; charset=utf-8',
        'svg'  => 'image/svg+xml',
        'png'  => 'image/png',
        'jpg'  => 'image/jpeg',
        'json' => 'application/json',
    ];
    header('Content-Type: ' . ($mime[$ext] ?? 'application/octet-stream'));
    readfile($target);
    exit;
}

// SPA fallback
if (is_file(__DIR__ . '/frontend/index.html')) {
    header('Content-Type: text/html; charset=utf-8');
    readfile(__DIR__ . '/frontend/index.html');
    exit;
}

http_response_code(404);
echo 'Frontend no encontrado en /frontend.';
