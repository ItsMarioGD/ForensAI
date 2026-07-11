<?php

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/PollinationsClient.php';

header('Content-Type: application/json; charset=utf-8');

$models = listPollinationsModels();
$recommended = POLLINATIONS_RECOMMENDED_MODELS;

echo json_encode([
    'installed'   => $models,
    'recommended' => $recommended,
    'default'     => POLLINATIONS_MODEL,
    'provider' => 'pollinations',
    'api_url'  => POLLINATIONS_BASE_URL,
], JSON_UNESCAPED_UNICODE);
