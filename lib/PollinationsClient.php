<?php
/**
 * ForensIA - Cliente HTTP de Pollinations (IA en la nube)
 * ======================================================
 * Proveedor de IA en la nube. Pollinations expone una API compatible
 * con OpenAI (POST /v1/chat/completions). Usamos un MODELO DE TEXTO para
 * generar el JSON de la simulación forense (los modelos de imagen como
 * "nano banana 2" no producen JSON estructurado).
 *
 * La API key se usa ÚNICAMENTE aquí, en el servidor. Nunca se envía al navegador.
 */

require_once __DIR__ . '/SystemPrompt.php';
require_once __DIR__ . '/JsonValidator.php';

/**
 * Request HTTP genérico a Pollinations con cURL.
 * @return array{0:int,1:string}
 */
function pollinationsHttpRequest(string $url, array $opts = [], int $timeout = 30): array {
    $ch = curl_init($url);
    if ($ch === false) {
        throw new RuntimeException('No se pudo inicializar cURL.');
    }

    $headers = ['Content-Type: application/json'];
    if (defined('POLLINATIONS_API_KEY') && POLLINATIONS_API_KEY !== '') {
        $headers[] = 'Authorization: Bearer ' . POLLINATIONS_API_KEY;
    }
    if (isset($opts[CURLOPT_HTTPHEADER])) {
        $headers = array_merge($headers, (array) $opts[CURLOPT_HTTPHEADER]);
        unset($opts[CURLOPT_HTTPHEADER]);
    }

    $defaultOpts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_HTTPHEADER => $headers,
    ];

    curl_setopt_array($ch, $defaultOpts + $opts);
    $body = curl_exec($ch);
    if ($body === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException("Error de cURL Pollinations: {$err}");
    }
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$code, (string) $body];
}

/**
 * Verifica que el servicio Pollinations responda (chat completion mínimo).
 * Usa el endpoint de chat (no /v1/models) que es más confiable.
 */
function checkPollinations(): bool {
    try {
        [$code, $body] = pollinationsHttpRequest(
            rtrim(POLLINATIONS_BASE_URL, '/') . '/v1/chat/completions',
            [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => json_encode([
                    'model' => 'openai',
                    'messages' => [['role' => 'user', 'content' => 'OK']],
                    'max_tokens' => 10,
                ], JSON_UNESCAPED_UNICODE),
            ],
            POLLINATIONS_CHECK_TIMEOUT
        );
        return $code === 200;
    } catch (RuntimeException $e) {
        return false;
    }
}

/**
 * Devuelve los modelos de texto recomendados de Pollinations.
 */
function listPollinationsModels(): array {
    return POLLINATIONS_RECOMMENDED_MODELS;
}

/**
 * Genera la simulación forense enviando el relato a Pollinations.
 *
 * @param string $relato Descripción del accidente.
 * @param string $model  Modelo de texto (ej. "openai").
 * @param string $url    Base URL de Pollinations.
 * @param int $timeout   Timeout en segundos.
 * @return array Payload validado de la simulación.
 * @throws RuntimeException Si hay cualquier error.
 */
function generateSimulationPollinations(
    string $relato,
    string $model = POLLINATIONS_MODEL,
    string $url = POLLINATIONS_BASE_URL,
    int $timeout = POLLINATIONS_GENERATE_TIMEOUT
): array {
    if (trim($relato) === '') {
        throw new RuntimeException('El relato del accidente está vacío.');
    }

    if (!defined('POLLINATIONS_API_KEY') || POLLINATIONS_API_KEY === '') {
        throw new RuntimeException(
            "❌ Falta la API key de Pollinations.\n" .
            "Define la variable de entorno POLLINATIONS_API_KEY o configúrala en config.php."
        );
    }

    $userPrompt = "Analiza el siguiente relato de accidente de tránsito y genera " .
                  "la simulación forense en JSON estricto, respetando EXACTAMENTE " .
                  "la estructura indicada en las reglas.\n\n" .
                  "RELATO:\n" . trim($relato);

    $payloadRequest = [
        'model' => $model,
        'messages' => [
            ['role' => 'system', 'content' => SYSTEM_PROMPT],
            ['role' => 'user', 'content' => $userPrompt],
        ],
        'temperature' => 0.1,
        'top_p' => 0.9,
        'max_tokens' => 2048,
    ];

    try {
        [$code, $body] = pollinationsHttpRequest(
            rtrim($url, '/') . '/v1/chat/completions',
            [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => json_encode($payloadRequest, JSON_UNESCAPED_UNICODE),
            ],
            $timeout
        );
    } catch (RuntimeException $e) {
        throw new RuntimeException("❌ Error de conexión con Pollinations: " . $e->getMessage());
    }

    if ($code !== 200) {
        $errText = $body;
        $decoded = json_decode($body, true);
        if (is_array($decoded) && isset($decoded['error']['message'])) {
            $errText = $decoded['error']['message'];
        }
        throw new RuntimeException("❌ Pollinations devolvió HTTP {$code}: {$errText}");
    }

    $data = json_decode($body, true);
    if (!is_array($data)) {
        throw new RuntimeException("❌ Respuesta no-JSON de Pollinations: " . substr($body, 0, 300));
    }

    // Extraer el contenido del mensaje según el formato OpenAI.
    $content = '';
    if (isset($data['choices'][0]['message']['content'])) {
        $content = (string) $data['choices'][0]['message']['content'];
    } elseif (isset($data['choices'][0]['text'])) {
        $content = (string) $data['choices'][0]['text'];
    }

    if ($content === '') {
        throw new RuntimeException('❌ Pollinations devolvió una respuesta vacía.');
    }

    // Parseo del JSON (directo o embebido en prosa).
    $payload = null;
    $decoded = json_decode($content, true);
    if (is_array($decoded)) {
        $payload = $decoded;
    } else {
        $bloque = extractJsonBlock($content);
        if ($bloque !== null) {
            $decoded = json_decode($bloque, true);
            if (is_array($decoded)) {
                $payload = $decoded;
            } else {
                throw new RuntimeException(
                    "❌ La IA no devolvió un JSON válido.\n" . substr($content, 0, 500)
                );
            }
        }
    }

    if ($payload === null) {
        throw new RuntimeException(
            "❌ No se encontró JSON en la respuesta de Pollinations:\n" . substr($content, 0, 500)
        );
    }

    if (!validatePayload($payload)) {
        throw new RuntimeException(
            "❌ El JSON devuelto no cumple el esquema esperado.\n" .
            "Faltan claves obligatorias: 'infraestructura', 'dictamen_tecnico' " .
            "o 'animacion_actores' con la estructura de frames correcta.\n\n" .
            "Recibido:\n" . substr(json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), 0, 800)
        );
    }

    return coerceTypes($payload);
}
