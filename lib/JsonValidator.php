<?php
/**
 * ForensIA - Validador de JSON
 * ============================
 * Valida y transforma el JSON generado por la IA:
 *   - _extract_json_block  -> extractJsonBlock
 *   - _validate_payload    -> validatePayload
 *   - _coerce_types        -> coerceTypes
 *
 * Sin cambios semánticos; el comportamiento es idéntico al original.
 */

require_once __DIR__ . '/SystemPrompt.php';

/**
 * Intenta extraer un objeto JSON de un texto que podría contener prosa.
 * Los modelos a veces agregan explicaciones antes/después del JSON.
 *
 * @param string $text Texto crudo devuelto por la IA.
 * @return string|null Bloque JSON balanceado, o null si no se encuentra.
 */
function extractJsonBlock(string $text): ?string {
    $text = trim($text);
    if ($text === '') {
        return null;
    }

    // 1) ¿El texto completo es JSON puro?
    if (substr($text, 0, 1) === '{') {
        $depth = 0;
        $len = strlen($text);
        for ($i = 0; $i < $len; $i++) {
            $ch = $text[$i];
            if ($ch === '{') {
                $depth++;
            } elseif ($ch === '}') {
                $depth--;
                if ($depth === 0) {
                    return substr($text, 0, $i + 1);
                }
            }
        }
        return $text;
    }

    // 2) Buscar primer '{' y extraer bloque balanceado
    $start = strpos($text, '{');
    if ($start === false) {
        return null;
    }

    $depth = 0;
    $len = strlen($text);
    for ($i = $start; $i < $len; $i++) {
        $ch = $text[$i];
        if ($ch === '{') {
            $depth++;
        } elseif ($ch === '}') {
            $depth--;
            if ($depth === 0) {
                return substr($text, $start, $i - $start + 1);
            }
        }
    }
    return null;
}

/**
 * Verifica que el JSON de la IA tenga la estructura mínima esperada.
 *
 * @param array $payload Payload a validar.
 * @return bool true si cumple el esquema.
 */
function validatePayload(array $payload): bool {
    $requiredRoot = ['infraestructura', 'dictamen_tecnico', 'animacion_actores'];
    foreach ($requiredRoot as $key) {
        if (!array_key_exists($key, $payload)) {
            return false;
        }
    }

    if (!is_array($payload['animacion_actores']) || count($payload['animacion_actores']) < 2) {
        return false;
    }

    $requiredFrameKeys = ['segundo', 'v1_x', 'v1_y', 'v1_angulo', 'v2_x', 'v2_y', 'v2_angulo'];
    foreach ($payload['animacion_actores'] as $frame) {
        if (!is_array($frame)) {
            return false;
        }
        foreach ($requiredFrameKeys as $key) {
            if (!array_key_exists($key, $frame)) {
                return false;
            }
            if (!is_numeric($frame[$key])) {
                return false;
            }
        }
    }

    return true;
}

/**
 * Asegura que los valores numéricos sean float (no strings).
 *
 * @param array $payload Payload validado.
 * @return array Mismo payload con tipos coercionados.
 */
function coerceTypes(array $payload): array {
    $keys = ['segundo', 'v1_x', 'v1_y', 'v1_angulo', 'v2_x', 'v2_y', 'v2_angulo'];
    foreach ($payload['animacion_actores'] as &$frame) {
        foreach ($keys as $k) {
            if (is_numeric($frame[$k] ?? null)) {
                $frame[$k] = (float) $frame[$k];
            }
        }
    }
    unset($frame);
    return $payload;
}
