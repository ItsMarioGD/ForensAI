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

// Solo se sirven archivos estáticos de /frontend y /vendor con extensiones
// conocidas: nunca código PHP (config.php guarda la API key) ni rutas con "..".
$mime = [
    'html' => 'text/html; charset=utf-8',
    'js'   => 'application/javascript; charset=utf-8',
    'css'  => 'text/css; charset=utf-8',
    'svg'  => 'image/svg+xml',
    'png'  => 'image/png',
    'jpg'  => 'image/jpeg',
    'json' => 'application/json',
];
$ext = strtolower(pathinfo($rel, PATHINFO_EXTENSION));
if (isset($mime[$ext]) && strpos($rel, '..') === false) {
    $candidates = [
        [__DIR__ . '/frontend', $rel],
        [__DIR__ . '/vendor', $rel],
    ];
    if (strpos($rel, 'vendor/') === 0) {
        $candidates[] = [__DIR__ . '/vendor', substr($rel, strlen('vendor/'))];
    }
    foreach ($candidates as [$base, $file]) {
        $target = realpath($base . '/' . $file);
        $root = realpath($base);
        if ($target !== false && $root !== false && strpos($target, $root . DIRECTORY_SEPARATOR) === 0 && is_file($target)) {
            header('Content-Type: ' . $mime[$ext]);
            // En Vercel la CDN guarda los archivos estáticos (la caché es por despliegue).
            header('Cache-Control: public, max-age=300, s-maxage=86400');
            readfile($target);
            exit;
        }
    }
}

// SPA fallback
if (is_file(__DIR__ . '/frontend/index.html')) {
    header('Content-Type: text/html; charset=utf-8');
    readfile(__DIR__ . '/frontend/index.html');
    exit;
}

http_response_code(404);
echo 'Frontend no encontrado en /frontend.';
