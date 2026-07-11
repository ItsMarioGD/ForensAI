<?php
/**
 * ForensIA - Cliente HTTP de Ollama
 * =================================
 * Puerto directo de las funciones públicas de utils/ai_engine.py:
 *   - check_ollama_running -> checkOllamaRunning
 *   - list_local_models   -> listLocalModels
 *   - generate_simulation -> generateSimulation
 *
 * Usa cURL (extensión estándar de PHP, presente en XAMPP).
 *
 * Excepciones: lanza RuntimeException con mensajes idénticos al Python
 * para mantener paridad con la app de escritorio original.
 */

require_once __DIR__ . '/SystemPrompt.php';
require_once __DIR__ . '/JsonValidator.php';

/**
 * Ejecuta una request HTTP con cURL y devuelve [http_code, body].
 * Encapsula el boilerplate común a GET/POST.
 *
 * @param string $url URL completa.
 * @param array $opts Opciones adicionales para curl_setopt_array.
 * @param int $timeout Timeout total en segundos.
 * @return array{0:int,1:string} Tupla [http_code, body].
 */
function ollamaHttpRequest(string $url, array $opts = [], int $timeout = 30): array {
    $ch = curl_init($url);
    if ($ch === false) {
        throw new RuntimeException('No se pudo inicializar cURL.');
    }

    // Headers base (incluye Authorization si hay API key configurada)
    $headers = [];
    if (defined('OLLAMA_API_KEY') && OLLAMA_API_KEY !== '') {
        $headers[] = 'Authorization: Bearer ' . OLLAMA_API_KEY;
    }
    if (isset($opts[CURLOPT_HTTPHEADER])) {
        $headers = array_merge($headers, (array) $opts[CURLOPT_HTTPHEADER]);
        unset($opts[CURLOPT_HTTPHEADER]);
    }

    $defaultOpts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_USERAGENT => 'ForensIA-PHP/3.0',
        CURLOPT_HTTPHEADER => $headers,
    ];

    curl_setopt_array($ch, $defaultOpts + $opts);
    $body = curl_exec($ch);

    if ($body === false) {
        $errNo = curl_errno($ch);
        $errStr = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException("Error de cURL ({$errNo}): {$errStr}");
    }

    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return [$code, (string) $body];
}

/**
 * Verifica si el servidor Ollama responde.
 *
 * @param string $url URL base (ej. http://localhost:11434).
 * @param int $timeout Timeout en segundos.
 * @return bool true si responde 200 en /api/tags.
 */
function checkOllamaRunning(string $url = OLLAMA_URL, int $timeout = OLLAMA_CHECK_TIMEOUT): bool {
    global $_ollamaLastError;
    $_ollamaLastError = '';
    try {
        [$code] = ollamaHttpRequest(
            rtrim($url, '/') . '/api/tags',
            [],
            $timeout
        );
        if ($code !== 200) {
            $_ollamaLastError = "HTTP {$code} al consultar /api/tags";
            return false;
        }
        return true;
    } catch (RuntimeException $e) {
        $_ollamaLastError = $e->getMessage();
        return false;
    }
}

/**
 * Devuelve el último error de conexión con Ollama (para diagnóstico en la UI).
 */
function ollamaLastError(): string {
    global $_ollamaLastError;
    return $_ollamaLastError ?? '';
}

/**
 * Devuelve la lista de modelos instalados en Ollama.
 *
 * @param string $url URL base.
 * @param int $timeout Timeout en segundos.
 * @return array Lista de modelos (cada uno: ['name' => '...', 'size' => ..., ...]).
 */
function listLocalModels(string $url = OLLAMA_URL, int $timeout = OLLAMA_LIST_TIMEOUT): array {
    try {
        [$code, $body] = ollamaHttpRequest(
            rtrim($url, '/') . '/api/tags',
            [],
            $timeout
        );
    } catch (RuntimeException $e) {
        return [];
    }

    if ($code !== 200 || $body === '') {
        return [];
    }

    $data = json_decode($body, true);
    if (!is_array($data) || !isset($data['models'])) {
        return [];
    }

    return $data['models'];
}

/**
 * Envía el relato a Ollama y devuelve el payload validado.
 *
 * @param string $relato Descripción en lenguaje natural.
 * @param string $model Nombre del modelo (ej. "llama3.1:8b").
 * @param string $url URL base de Ollama.
 * @param int $timeout Timeout en segundos.
 * @return array Payload validado y con tipos coercionados.
 * @throws RuntimeException Si hay cualquier error (Ollama, modelo, JSON, esquema).
 */
function generateSimulation(
    string $relato,
    string $model = DEFAULT_MODEL,
    string $url = OLLAMA_URL,
    int $timeout = OLLAMA_GENERATE_TIMEOUT
): array {
    // 1) Validación del relato
    if (trim($relato) === '') {
        throw new RuntimeException('El relato del accidente está vacío.');
    }

    // 2) Ollama debe estar activo
    if (!checkOllamaRunning($url)) {
        throw new RuntimeException(
            "❌ Ollama no responde en {$url}.\n\n" .
            "Verifica que el servicio esté ejecutándose con:\n" .
            "    ollama serve\n\n" .
            "Y que el modelo esté descargado:\n" .
            "    ollama pull {$model}"
        );
    }

    // 3) El modelo debe estar instalado (matching laxo por tag)
    $modelosLocales = [];
    foreach (listLocalModels($url) as $m) {
        if (isset($m['name'])) {
            $modelosLocales[] = $m['name'];
        }
    }
    $modeloDisponible = false;
    foreach ($modelosLocales as $m) {
        if ($m === $model || explode(':', $m)[0] === explode(':', $model)[0]) {
            $modeloDisponible = true;
            break;
        }
    }
    if (!empty($modelosLocales) && !$modeloDisponible) {
        throw new RuntimeException(
            "❌ El modelo '{$model}' no está instalado en Ollama.\n\n" .
            "Modelos disponibles: " . implode(', ', $modelosLocales) . "\n\n" .
            "Para descargarlo ejecuta:\n" .
            "    ollama pull {$model}"
        );
    }

    // 4) Construir el prompt del usuario
    $userPrompt = "Analiza el siguiente relato de accidente de tránsito y genera " .
                  "la simulación forense en JSON estricto, respetando EXACTAMENTE " .
                  "la estructura indicada en las reglas.\n\n" .
                  "RELATO:\n" . trim($relato);

    // 5) Construir el payload de Ollama
    $payloadRequest = [
        'model' => $model,
        'prompt' => $userPrompt,
        'system' => SYSTEM_PROMPT,
        'stream' => false,
        'options' => [
            'temperature' => 0.1,     // Bajo para máxima consistencia JSON
            'top_p' => 0.9,
            'num_predict' => 2048,
            'format' => 'json',       // Fuerza salida JSON en Ollama >= 0.5
        ],
    ];

    // 6) POST /api/generate
    try {
        [$code, $body] = ollamaHttpRequest(
            rtrim($url, '/') . '/api/generate',
            [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => json_encode($payloadRequest, JSON_UNESCAPED_UNICODE),
                CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                CURLOPT_CONNECTTIMEOUT => 10,
            ],
            $timeout
        );
    } catch (RuntimeException $e) {
        $msg = $e->getMessage();
        if (stripos($msg, 'timeout') !== false || stripos($msg, 'timed out') !== false) {
            throw new RuntimeException(
                "⏱️ Timeout ({$timeout}s) esperando a Ollama. " .
                "El modelo puede estar cargándose o el relato es muy largo."
            );
        }
        throw new RuntimeException("❌ Error de conexión con Ollama: {$msg}");
    }

    // 7) Verificar HTTP 200
    if ($code !== 200) {
        $errText = $body;
        $decoded = json_decode($body, true);
        if (is_array($decoded) && isset($decoded['error'])) {
            $errText = $decoded['error'];
        }
        throw new RuntimeException("❌ Ollama devolvió HTTP {$code}: {$errText}");
    }

    // 8) Decodificar respuesta
    $data = json_decode($body, true);
    if (!is_array($data)) {
        throw new RuntimeException(
            "❌ Respuesta no-JSON de Ollama: " . substr($body, 0, 300)
        );
    }

    $rawText = trim((string) ($data['response'] ?? ''));
    if ($rawText === '') {
        throw new RuntimeException('❌ Ollama devolvió una respuesta vacía.');
    }

    // 9) Intento directo de parseo
    $payload = null;
    $decoded = json_decode($rawText, true);
    if (is_array($decoded)) {
        $payload = $decoded;
    } else {
        // 10) Extraer bloque JSON de un texto con prosa
        $bloque = extractJsonBlock($rawText);
        if ($bloque !== null) {
            $decoded = json_decode($bloque, true);
            if (is_array($decoded)) {
                $payload = $decoded;
            } else {
                throw new RuntimeException(
                    "❌ La IA no devolvió un JSON válido.\n" .
                    "Fragmento recibido:\n" . substr($rawText, 0, 500)
                );
            }
        }
    }

    if ($payload === null) {
        throw new RuntimeException(
            "❌ No se encontró JSON en la respuesta de Ollama:\n" . substr($rawText, 0, 500)
        );
    }

    // 11) Validación de esquema
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
