<?php

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/PollinationsClient.php';

$running = checkPollinations();
$detail = $running ? '' : 'No se pudo contactar a gen.pollinations.ai (verifica tu conexión a internet)';

header('Content-Type: application/json; charset=utf-8');
http_response_code(200);
echo json_encode([
    'ai_active' => $running,
    'provider'  => 'pollinations',
    'api_url'   => POLLINATIONS_BASE_URL,
    'version'   => APP_VERSION,
    'error'     => $running ? '' : $detail,
], JSON_UNESCAPED_UNICODE);
