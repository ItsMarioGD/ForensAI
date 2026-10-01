<?php

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/PollinationsClient.php';

header('Content-Type: application/json; charset=utf-8');

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);

if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['error' => 'Body inválido. Se esperaba JSON con { "relato": "..." }.'], JSON_UNESCAPED_UNICODE);
    return;
}

$relato = isset($body['relato']) ? trim((string) $body['relato']) : '';
if ($relato === '') {
    http_response_code(400);
    echo json_encode(['error' => 'El campo "relato" es obligatorio.'], JSON_UNESCAPED_UNICODE);
    return;
}

$model = isset($body['model']) && $body['model'] !== '' ? (string) $body['model'] : POLLINATIONS_MODEL;

// "auto" (por defecto): la IA reconstruye el lugar desde el relato.
// "plantilla": se usa uno de los 4 mapas modelados.
$modoMapa = (isset($body['modo_mapa']) && $body['modo_mapa'] === 'plantilla') ? 'plantilla' : 'auto';

try {
    $payload = generateSimulationPollinations($relato, $model, POLLINATIONS_BASE_URL, POLLINATIONS_GENERATE_TIMEOUT, $modoMapa);
    http_response_code(200);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
} catch (RuntimeException $e) {
    $msg = $e->getMessage();
    $code = 503;
    if (stripos($msg, 'timeout') !== false) $code = 504;
    if (stripos($msg, 'api key') !== false) $code = 401;
    http_response_code($code);
    echo json_encode(['error' => $msg, 'relato' => $relato], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error inesperado: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
