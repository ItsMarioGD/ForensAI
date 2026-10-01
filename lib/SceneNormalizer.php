<?php
/**
 * ForensIA - Normalizador del escenario (mapa automático)
 * =======================================================
 * La IA describe el lugar del siniestro en el campo "escenario" (vías, zonas,
 * elementos, iluminación, clima). Los modelos de lenguaje no siempre respetan
 * el esquema al pie de la letra, así que aquí:
 *   - se traducen sinónimos ("farola" → "poste_luz", "pasto" → "cesped"...),
 *   - se validan y acotan números y coordenadas,
 *   - se expanden filas de elementos ("linea" + "cantidad") y rotondas
 *     ("centro" + "radio"),
 *   - y, si las vías no cubren las trayectorias de V1/V2 antes del impacto,
 *     se infieren vías a partir de esas trayectorias.
 *
 * El resultado tiene siempre la misma forma, de modo que el frontend (y el
 * script Turtle) pueden dibujarlo sin más comprobaciones de esquema.
 */

const ESC_LIMITE_COORD = 250.0;
const ESC_MAX_VIAS = 12;
const ESC_MAX_ZONAS = 10;
const ESC_MAX_ELEMENTOS = 120;
const ESC_MAX_FILA = 25;

const ESC_ZONAS = ['urbana', 'residencial', 'suburbana', 'rural', 'autopista', 'montana', 'industrial', 'estacionamiento'];
const ESC_ZONAS_SIN = [
    'urban' => 'urbana', 'urbano' => 'urbana', 'ciudad' => 'urbana', 'centro' => 'urbana', 'city' => 'urbana',
    'residential' => 'residencial', 'barrio' => 'residencial', 'colonia' => 'residencial', 'vecindario' => 'residencial',
    'suburbano' => 'suburbana', 'periferia' => 'suburbana', 'suburb' => 'suburbana',
    'campo' => 'rural', 'countryside' => 'rural', 'aldea' => 'rural', 'finca' => 'rural',
    'highway' => 'autopista', 'carretera' => 'autopista', 'autovia' => 'autopista', 'periferico' => 'autopista', 'freeway' => 'autopista',
    'mountain' => 'montana', 'sierra' => 'montana', 'cerro' => 'montana',
    'bodega' => 'industrial', 'fabrica' => 'industrial',
    'parqueo' => 'estacionamiento', 'parking' => 'estacionamiento', 'aparcamiento' => 'estacionamiento',
];

const ESC_TERRENOS = ['cesped', 'tierra', 'arena', 'grava', 'concreto', 'nieve'];
const ESC_TERRENOS_SIN = [
    'pasto' => 'cesped', 'grama' => 'cesped', 'hierba' => 'cesped', 'grass' => 'cesped', 'zacate' => 'cesped', 'verde' => 'cesped',
    'dirt' => 'tierra', 'barro' => 'tierra', 'lodo' => 'tierra', 'terraceria' => 'tierra',
    'sand' => 'arena', 'playa' => 'arena',
    'gravel' => 'grava', 'ripio' => 'grava', 'piedrin' => 'grava',
    'concrete' => 'concreto', 'cemento' => 'concreto', 'asfalto' => 'concreto', 'pavimento' => 'concreto', 'urbano' => 'concreto',
    'snow' => 'nieve',
];

const ESC_LUCES = ['dia', 'amanecer', 'atardecer', 'noche', 'nublado'];
const ESC_LUCES_SIN = [
    'daylight' => 'dia', 'day' => 'dia', 'diurno' => 'dia', 'manana' => 'dia', 'mediodia' => 'dia', 'tarde' => 'dia', 'soleado' => 'dia',
    'dawn' => 'amanecer', 'sunrise' => 'amanecer', 'alba' => 'amanecer',
    'sunset' => 'atardecer', 'dusk' => 'atardecer', 'ocaso' => 'atardecer', 'crepusculo' => 'atardecer', 'anochecer' => 'atardecer',
    'night' => 'noche', 'nocturno' => 'noche', 'nocturna' => 'noche', 'madrugada' => 'noche', 'oscuro' => 'noche',
    'overcast' => 'nublado', 'cloudy' => 'nublado', 'nubes' => 'nublado', 'gris' => 'nublado',
];

const ESC_CLIMAS = ['despejado', 'lluvia', 'niebla', 'nieve'];
const ESC_CLIMAS_SIN = [
    'clear' => 'despejado', 'sunny' => 'despejado', 'soleado' => 'despejado', 'seco' => 'despejado', 'normal' => 'despejado',
    'rain' => 'lluvia', 'lluvioso' => 'lluvia', 'llovizna' => 'lluvia', 'tormenta' => 'lluvia', 'aguacero' => 'lluvia', 'mojado' => 'lluvia', 'humedo' => 'lluvia',
    'fog' => 'niebla', 'neblina' => 'niebla', 'bruma' => 'niebla', 'mist' => 'niebla',
    'snow' => 'nieve', 'nevada' => 'nieve',
];

const ESC_TRAFICOS = ['ninguno', 'bajo', 'medio', 'alto'];
const ESC_TRAFICOS_SIN = [
    'none' => 'ninguno', 'nulo' => 'ninguno', 'vacio' => 'ninguno', 'sin' => 'ninguno',
    'low' => 'bajo', 'poco' => 'bajo', 'escaso' => 'bajo', 'ligero' => 'bajo',
    'medium' => 'medio', 'moderado' => 'medio', 'normal' => 'medio',
    'high' => 'alto', 'denso' => 'alto', 'congestionado' => 'alto', 'pesado' => 'alto', 'hora_pico' => 'alto',
];

const ESC_SUPERFICIES = ['asfalto', 'concreto', 'adoquin', 'tierra', 'grava'];
const ESC_SUPERFICIES_SIN = [
    'pavimento' => 'asfalto', 'asphalt' => 'asfalto', 'asfaltada' => 'asfalto', 'asfaltado' => 'asfalto',
    'cemento' => 'concreto', 'concrete' => 'concreto', 'hormigon' => 'concreto',
    'empedrado' => 'adoquin', 'cobblestone' => 'adoquin', 'piedra' => 'adoquin', 'adoquinado' => 'adoquin',
    'terraceria' => 'tierra', 'dirt' => 'tierra', 'lodo' => 'tierra', 'barro' => 'tierra', 'brecha' => 'tierra',
    'gravel' => 'grava', 'balastro' => 'grava', 'ripio' => 'grava', 'piedrin' => 'grava', 'lastre' => 'grava',
];

const ESC_SENTIDOS = ['doble', 'unico'];
const ESC_SENTIDOS_SIN = [
    'bidireccional' => 'doble', 'two_way' => 'doble', 'ambos' => 'doble', 'dos' => 'doble',
    'una_via' => 'unico', 'un_sentido' => 'unico', 'one_way' => 'unico', 'unidireccional' => 'unico', 'uno' => 'unico',
];

// Orden importante: "discontinua" antes que "continua" y "amarilla".
const ESC_LINEAS = ['doble_amarilla', 'discontinua', 'amarilla', 'continua', 'ninguna'];
const ESC_LINEAS_SIN = [
    'double_yellow' => 'doble_amarilla', 'doble' => 'doble_amarilla',
    'dashed' => 'discontinua', 'punteada' => 'discontinua', 'intermitente' => 'discontinua', 'segmentada' => 'discontinua',
    'yellow' => 'amarilla', 'solid' => 'continua', 'blanca' => 'continua',
    'none' => 'ninguna', 'sin' => 'ninguna', 'no' => 'ninguna',
];

const ESC_ZONA_TIPOS = ['parque', 'cesped', 'bosque', 'cultivo', 'agua', 'plaza', 'estacionamiento', 'tierra', 'arena', 'isla'];
const ESC_ZONA_TIPOS_SIN = [
    'park' => 'parque', 'jardin' => 'parque', 'area_verde' => 'parque',
    'grass' => 'cesped', 'pasto' => 'cesped', 'grama' => 'cesped', 'potrero' => 'cesped',
    'forest' => 'bosque', 'arboleda' => 'bosque', 'monte' => 'bosque', 'selva' => 'bosque',
    'campo' => 'cultivo', 'sembradio' => 'cultivo', 'milpa' => 'cultivo', 'plantacion' => 'cultivo', 'farm' => 'cultivo', 'cafetal' => 'cultivo',
    'rio' => 'agua', 'lago' => 'agua', 'laguna' => 'agua', 'water' => 'agua', 'canal' => 'agua', 'estanque' => 'agua', 'mar' => 'agua', 'barranco' => 'agua',
    'explanada' => 'plaza', 'atrio' => 'plaza',
    'parking' => 'estacionamiento', 'parqueo' => 'estacionamiento',
    'dirt' => 'tierra', 'baldio' => 'tierra', 'lote' => 'tierra', 'terreno' => 'tierra',
    'sand' => 'arena', 'playa' => 'arena',
    'isleta' => 'isla', 'camellon' => 'isla', 'mediana' => 'isla', 'arriate' => 'isla',
];

const ESC_ELEMENTOS = [
    'edificio', 'casa', 'tienda', 'gasolinera', 'arbol', 'palmera', 'pino', 'arbusto',
    'poste_luz', 'poste_electrico', 'semaforo', 'senal_pare', 'senal_ceda', 'senal_velocidad', 'senal',
    'muro', 'valla', 'guardarrail', 'barrera', 'cono', 'barril', 'parada_bus', 'vehiculo_estacionado',
    'paso_peatonal', 'tope', 'hidrante', 'banca', 'contenedor', 'roca', 'poste_km',
    'bache', 'charco', 'mancha_aceite',
];

// Pares [patrón, tipo] en orden de especificidad (los más específicos primero).
const ESC_ELEMENTOS_SIN = [
    ['poste_de_luz', 'poste_luz'], ['farola', 'poste_luz'], ['luminaria', 'poste_luz'], ['lampara', 'poste_luz'],
    ['alumbrado', 'poste_luz'], ['street_light', 'poste_luz'], ['streetlight', 'poste_luz'],
    ['poste_km', 'poste_km'], ['kilometr', 'poste_km'], ['mojon', 'poste_km'],
    ['semaforo', 'semaforo'], ['traffic_light', 'semaforo'],
    ['ceda', 'senal_ceda'], ['yield', 'senal_ceda'],
    ['velocidad', 'senal_velocidad'], ['speed_limit', 'senal_velocidad'],
    ['guardarrail', 'guardarrail'], ['guard_rail', 'guardarrail'], ['guardrail', 'guardarrail'], ['guardavia', 'guardarrail'],
    ['defensa', 'guardarrail'], ['barandal', 'guardarrail'], ['baranda', 'guardarrail'],
    ['jersey', 'barrera'], ['barricada', 'barrera'], ['separador', 'barrera'], ['divisor', 'barrera'], ['barrera', 'barrera'],
    ['muro', 'muro'], ['pared', 'muro'], ['wall', 'muro'], ['tapia', 'muro'],
    ['valla_publicitaria', 'senal'], ['valla', 'valla'], ['cerca', 'valla'], ['fence', 'valla'], ['alambr', 'valla'],
    ['reja', 'valla'], ['malla', 'valla'],
    ['pare', 'senal_pare'], ['stop', 'senal_pare'], ['senal_alto', 'senal_pare'], ['de_alto', 'senal_pare'], ['alto_total', 'senal_pare'],
    ['paso_peatonal', 'paso_peatonal'], ['cebra', 'paso_peatonal'], ['crosswalk', 'paso_peatonal'], ['peatonal', 'paso_peatonal'],
    ['parada', 'parada_bus'], ['garita', 'parada_bus'], ['bus_stop', 'parada_bus'], ['paradero', 'parada_bus'],
    ['gasolinera', 'gasolinera'], ['gas_station', 'gasolinera'], ['estacion_de_servicio', 'gasolinera'],
    ['palmera', 'palmera'], ['palma', 'palmera'], ['palm', 'palmera'],
    ['pino', 'pino'], ['pine', 'pino'], ['cipres', 'pino'], ['conifer', 'pino'],
    ['arbusto', 'arbusto'], ['bush', 'arbusto'], ['seto', 'arbusto'], ['matorral', 'arbusto'],
    ['arbol', 'arbol'], ['tree', 'arbol'],
    ['tienda', 'tienda'], ['comercio', 'tienda'], ['local', 'tienda'], ['negocio', 'tienda'], ['shop', 'tienda'],
    ['store', 'tienda'], ['farmacia', 'tienda'], ['restaurante', 'tienda'], ['abarrot', 'tienda'], ['kiosco', 'tienda'],
    ['autoservicio', 'tienda'],
    ['casa', 'casa'], ['house', 'casa'], ['vivienda', 'casa'], ['residencia', 'casa'],
    ['edificio', 'edificio'], ['building', 'edificio'], ['torre', 'edificio'], ['oficina', 'edificio'],
    ['hotel', 'edificio'], ['hospital', 'edificio'], ['escuela', 'edificio'], ['colegio', 'edificio'],
    ['iglesia', 'edificio'], ['centro_comercial', 'edificio'], ['mall', 'edificio'], ['bodega', 'edificio'],
    ['banco', 'edificio'],
    ['estacionad', 'vehiculo_estacionado'], ['aparcad', 'vehiculo_estacionado'], ['parked', 'vehiculo_estacionado'],
    ['vehiculo', 'vehiculo_estacionado'], ['carro', 'vehiculo_estacionado'], ['auto', 'vehiculo_estacionado'],
    ['camion', 'vehiculo_estacionado'], ['bus', 'vehiculo_estacionado'],
    ['poste', 'poste_electrico'], ['pole', 'poste_electrico'],
    ['senal', 'senal'], ['letrero', 'senal'], ['rotulo', 'senal'], ['sign', 'senal'],
    ['tope', 'tope'], ['reductor', 'tope'], ['tumulo', 'tope'], ['speed_bump', 'tope'], ['policia_acostado', 'tope'],
    ['cono', 'cono'], ['cone', 'cono'],
    ['barril', 'barril'], ['tonel', 'barril'], ['tambo', 'barril'],
    ['hidrante', 'hidrante'], ['hydrant', 'hidrante'],
    ['banca', 'banca'], ['bench', 'banca'],
    ['contenedor', 'contenedor'], ['basurero', 'contenedor'], ['dumpster', 'contenedor'], ['container', 'contenedor'],
    ['roca', 'roca'], ['piedra', 'roca'], ['rock', 'roca'],
    ['bache', 'bache'], ['hoyo', 'bache'], ['pothole', 'bache'], ['agujero', 'bache'],
    ['charco', 'charco'], ['puddle', 'charco'],
    ['aceite', 'mancha_aceite'], ['derrame', 'mancha_aceite'], ['combustible', 'mancha_aceite'], ['oil', 'mancha_aceite'],
];

const ESC_ELEMENTOS_LINEALES = ['muro', 'valla', 'guardarrail', 'barrera'];

// ─────────────────────────────────────────────────────────────────────────
//  Utilidades básicas
// ─────────────────────────────────────────────────────────────────────────

/**
 * Normaliza un texto a clave ASCII: minúsculas, sin tildes, "_" como separador.
 * (Sin depender de mbstring, que no siempre está activo en XAMPP.)
 */
function escClave($valor): string {
    if (!is_string($valor) && !is_numeric($valor)) {
        return '';
    }
    $s = strtr(trim((string) $valor), [
        'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n',
        'Á' => 'a', 'É' => 'e', 'Í' => 'i', 'Ó' => 'o', 'Ú' => 'u', 'Ü' => 'u', 'Ñ' => 'n',
    ]);
    $s = strtolower($s);
    $s = preg_replace('/[^a-z0-9]+/', '_', $s);
    return trim((string) $s, '_');
}

/**
 * Traduce un valor libre de la IA a uno de los valores permitidos.
 * Orden: coincidencia exacta → sinónimo exacto → contiene permitido → contiene sinónimo.
 */
function escEnum($valor, array $permitidos, array $sinonimos, string $defecto): string {
    $k = escClave($valor);
    if ($k === '') {
        return $defecto;
    }
    if (in_array($k, $permitidos, true)) {
        return $k;
    }
    if (isset($sinonimos[$k])) {
        return $sinonimos[$k];
    }
    foreach ($permitidos as $p) {
        if (strpos($k, $p) !== false) {
            return $p;
        }
    }
    foreach ($sinonimos as $patron => $destino) {
        if (strlen((string) $patron) >= 3 && strpos($k, (string) $patron) !== false) {
            return $destino;
        }
    }
    return $defecto;
}

function escNum($valor, ?float $defecto, float $min, float $max): ?float {
    if (is_string($valor)) {
        $valor = str_replace(',', '.', trim($valor));
    }
    if (!is_numeric($valor)) {
        return $defecto;
    }
    $n = (float) $valor;
    if (!is_finite($n)) {
        return $defecto;
    }
    return max($min, min($max, $n));
}

function escBool($valor, bool $defecto): bool {
    if (is_bool($valor)) {
        return $valor;
    }
    if (is_numeric($valor)) {
        return ((float) $valor) != 0.0;
    }
    $k = escClave($valor);
    if (in_array($k, ['true', 'si', 'yes', 'verdadero', 'ambos', 'ambas'], true)) {
        return true;
    }
    if (in_array($k, ['false', 'no', 'falso', 'ninguna', 'ninguno'], true)) {
        return false;
    }
    return $defecto;
}

function escTexto($valor, int $max): string {
    if (!is_string($valor) && !is_numeric($valor)) {
        return '';
    }
    $s = trim(preg_replace('/\s+/u', ' ', (string) $valor) ?? '');
    if (strlen($s) > $max) {
        // Cortar sin partir un carácter UTF-8 a la mitad.
        $s = substr($s, 0, $max);
        $s = preg_replace('/[\x80-\xBF]*$/', '', $s) ?? $s;
        $s = preg_replace('/[\xC0-\xFF]$/', '', $s) ?? $s;
    }
    return $s;
}

/** Ángulo de brújula (0 = norte, 90 = este) del vector (dx, dy). */
function escRumbo(float $dx, float $dy): float {
    $a = rad2deg(atan2($dx, $dy));
    return fmod($a + 360.0, 360.0);
}

function escAngulo($valor, float $defecto = 0.0): float {
    $a = escNum($valor, null, -100000, 100000);
    if ($a === null) {
        return $defecto;
    }
    return round(fmod(fmod($a, 360.0) + 360.0, 360.0), 1);
}

/** Convierte [x,y], {x,y} o {"x":..,"y":..} a [x, y] (acotado). */
function escPunto($p): ?array {
    if (!is_array($p)) {
        return null;
    }
    if (array_key_exists('x', $p) && array_key_exists('y', $p)) {
        $x = $p['x'];
        $y = $p['y'];
    } elseif (count($p) >= 2 && array_key_exists(0, $p) && array_key_exists(1, $p)) {
        $x = $p[0];
        $y = $p[1];
    } else {
        return null;
    }
    $x = escNum($x, null, -ESC_LIMITE_COORD, ESC_LIMITE_COORD);
    $y = escNum($y, null, -ESC_LIMITE_COORD, ESC_LIMITE_COORD);
    if ($x === null || $y === null) {
        return null;
    }
    return [round($x, 2), round($y, 2)];
}

/** Lista de puntos limpia (sin duplicados consecutivos a menos de $minDist m). */
function escPuntos($lista, float $minDist = 0.5, int $max = 64): array {
    if (!is_array($lista)) {
        return [];
    }
    $out = [];
    foreach ($lista as $p) {
        $q = escPunto($p);
        if ($q === null) {
            continue;
        }
        if ($out) {
            $u = $out[count($out) - 1];
            if (hypot($q[0] - $u[0], $q[1] - $u[1]) < $minDist) {
                continue;
            }
        }
        $out[] = $q;
        if (count($out) >= $max) {
            break;
        }
    }
    return $out;
}

function escLongitud(array $pts, bool $cerrada = false): float {
    $len = 0.0;
    $n = count($pts);
    for ($i = 1; $i < $n; $i++) {
        $len += hypot($pts[$i][0] - $pts[$i - 1][0], $pts[$i][1] - $pts[$i - 1][1]);
    }
    if ($cerrada && $n > 2) {
        $len += hypot($pts[0][0] - $pts[$n - 1][0], $pts[0][1] - $pts[$n - 1][1]);
    }
    return $len;
}

function escCirculo(float $cx, float $cy, float $r, int $segmentos): array {
    $pts = [];
    for ($i = 0; $i < $segmentos; $i++) {
        $a = 2 * M_PI * $i / $segmentos;
        $pts[] = [round($cx + cos($a) * $r, 2), round($cy + sin($a) * $r, 2)];
    }
    return $pts;
}

/** Distancia de un punto a una polilínea (opcionalmente cerrada). */
function escDistanciaPolilinea(float $px, float $py, array $pts, bool $cerrada = false): float {
    $n = count($pts);
    if ($n === 0) {
        return INF;
    }
    if ($n === 1) {
        return hypot($px - $pts[0][0], $py - $pts[0][1]);
    }
    $best = INF;
    $segs = $cerrada ? $n : $n - 1;
    for ($i = 0; $i < $segs; $i++) {
        [$ax, $ay] = $pts[$i];
        [$bx, $by] = $pts[($i + 1) % $n];
        $dx = $bx - $ax;
        $dy = $by - $ay;
        $l2 = $dx * $dx + $dy * $dy;
        $t = $l2 > 0 ? max(0.0, min(1.0, (($px - $ax) * $dx + ($py - $ay) * $dy) / $l2)) : 0.0;
        $d = hypot($px - ($ax + $t * $dx), $py - ($ay + $t * $dy));
        if ($d < $best) {
            $best = $d;
        }
    }
    return $best;
}

// ─────────────────────────────────────────────────────────────────────────
//  Vías
// ─────────────────────────────────────────────────────────────────────────

function escAnchoPorZona(string $zona): float {
    switch ($zona) {
        case 'autopista': return 22.0;
        case 'urbana': return 12.0;
        case 'industrial': return 11.0;
        case 'residencial':
        case 'suburbana': return 8.0;
        case 'rural':
        case 'montana': return 7.0;
        default: return 9.0;
    }
}

function escNormalizarVia(array $v, string $zona): ?array {
    $forma = 'linea';
    $cerrada = escBool($v['cerrada'] ?? false, false);
    $centro = null;
    $radio = null;

    $crudos = $v['puntos'] ?? $v['eje'] ?? $v['trazado'] ?? $v['coordenadas'] ?? $v['points'] ?? $v['path'] ?? null;
    $pts = escPuntos($crudos);

    if (isset($v['centro']) || isset($v['radio'])) {
        $c = escPunto($v['centro'] ?? null);
        $r = escNum($v['radio'] ?? null, null, 6.0, 60.0);
        if ($c !== null && $r !== null) {
            $forma = 'circular';
            $cerrada = true;
            $centro = $c;
            $radio = round($r, 2);
            $pts = escCirculo($c[0], $c[1], $r, 40);
        }
    }

    if (count($pts) < 2 || escLongitud($pts, $cerrada) < 3.0) {
        return null;
    }
    if (count($pts) < 3) {
        $cerrada = false;
    }

    $superficie = escEnum($v['superficie'] ?? $v['pavimento'] ?? '', ESC_SUPERFICIES, ESC_SUPERFICIES_SIN, 'asfalto');
    $sentido = escEnum($v['sentido'] ?? '', ESC_SENTIDOS, ESC_SENTIDOS_SIN, $forma === 'circular' ? 'unico' : 'doble');

    $ancho = escNum($v['ancho'] ?? $v['width'] ?? null, null, 3.0, 40.0);
    $carriles = escNum($v['carriles'] ?? $v['lanes'] ?? null, null, 1, 8);
    if ($ancho === null && $carriles !== null) {
        $ancho = max(3.0, min(40.0, $carriles * 3.5));
    }
    if ($ancho === null) {
        $ancho = $forma === 'circular' ? 9.0 : escAnchoPorZona($zona);
    }
    if ($carriles === null) {
        $carriles = $sentido === 'doble'
            ? max(2, 2 * (int) round($ancho / 7.0))
            : max(1, (int) round($ancho / 3.5));
    }
    $carriles = (int) max(1, min(8, round($carriles)));

    $sinMarcas = in_array($superficie, ['tierra', 'grava'], true);
    if ($sinMarcas || $sentido === 'unico') {
        $lineaDefecto = 'ninguna';
    } else {
        $lineaDefecto = $carriles >= 4 ? 'doble_amarilla' : 'discontinua';
    }
    $lineaCruda = $v['linea_central'] ?? $v['linea'] ?? '';
    $k = escClave($lineaCruda);
    if (strpos($k, 'doble') !== false && strpos($k, 'discontinu') === false) {
        $linea = 'doble_amarilla'; // "doble línea amarilla", "línea doble"...
    } else {
        $linea = escEnum($lineaCruda, ESC_LINEAS, ESC_LINEAS_SIN, $lineaDefecto);
    }

    $urbano = in_array($zona, ['urbana', 'residencial', 'suburbana'], true);
    $acera = escBool($v['acera'] ?? $v['aceras'] ?? null, $urbano && !$sinMarcas);
    $berma = escBool($v['berma'] ?? $v['hombro'] ?? $v['arcen'] ?? null,
        in_array($zona, ['rural', 'autopista', 'montana'], true) && !$sinMarcas);

    $via = [
        'nombre' => escTexto($v['nombre'] ?? $v['name'] ?? '', 60),
        'forma' => $forma,
        'puntos' => $pts,
        'cerrada' => $cerrada,
        'ancho' => round($ancho, 2),
        'carriles' => $carriles,
        'sentido' => $sentido,
        'superficie' => $superficie,
        'linea_central' => $linea,
        'acera' => $acera,
        'berma' => $berma,
        'auto' => false,
    ];
    if ($forma === 'circular') {
        $via['centro'] = $centro;
        $via['radio'] = $radio;
    }
    return $via;
}

/** ¿El punto está sobre (o junto a) alguna vía? */
function escSobreVias(float $x, float $y, array $vias, float $margen): bool {
    foreach ($vias as $v) {
        if (escDistanciaPolilinea($x, $y, $v['puntos'], $v['cerrada']) <= $v['ancho'] / 2 + $margen) {
            return true;
        }
    }
    return false;
}

/**
 * Si el recorrido pre-impacto de un vehículo no transcurre sobre ninguna vía,
 * crea una vía a lo largo de ese recorrido (desplazada para que el vehículo
 * quede en su carril derecho) y la prolonga antes y después del impacto.
 */
function escInferirViasDeTrayectorias(array $vias, array $frames, string $zona): array {
    $n = count($frames);
    if ($n < 2) {
        return $vias;
    }
    $impacto = intdiv($n, 2);
    $ancho = $zona === 'autopista' ? 14.0 : (in_array($zona, ['rural', 'montana'], true) ? 7.0 : 9.0);

    foreach (['v1' => 'V1', 'v2' => 'V2'] as $k => $etiqueta) {
        $pts = [];
        for ($i = 0; $i <= $impacto; $i++) {
            $p = escPunto([$frames[$i]["{$k}_x"] ?? null, $frames[$i]["{$k}_y"] ?? null]);
            if ($p !== null) {
                $pts[] = $p;
            }
        }
        $pts = escPuntos($pts, 1.0);
        if (count($pts) < 2 || escLongitud($pts) < 4.0) {
            continue; // Vehículo detenido: no necesita vía propia.
        }

        $cubiertos = 0;
        foreach ($pts as $p) {
            if (escSobreVias($p[0], $p[1], $vias, 2.5)) {
                $cubiertos++;
            }
        }
        if ($cubiertos / count($pts) >= 0.5) {
            continue;
        }

        // Eje desplazado a la izquierda del sentido de marcha (circulación por la derecha).
        $m = count($pts);
        $off = $ancho / 4;
        $eje = [];
        $dirs = [];
        for ($i = 0; $i < $m; $i++) {
            $a = $pts[max(0, $i - 1)];
            $b = $pts[min($m - 1, $i + 1)];
            $dx = $b[0] - $a[0];
            $dy = $b[1] - $a[1];
            $l = hypot($dx, $dy) ?: 1.0;
            $dirs[$i] = [$dx / $l, $dy / $l];
            $eje[] = [$pts[$i][0] - $dirs[$i][1] * $off, $pts[$i][1] + $dirs[$i][0] * $off];
        }
        $ext = 60.0;
        array_unshift($eje, [$eje[0][0] - $dirs[0][0] * $ext, $eje[0][1] - $dirs[0][1] * $ext]);
        $u = $eje[count($eje) - 1];
        $eje[] = [$u[0] + $dirs[$m - 1][0] * $ext, $u[1] + $dirs[$m - 1][1] * $ext];

        $eje = escPuntos($eje, 1.0);
        if (count($eje) < 2) {
            continue;
        }
        $vias[] = [
            'nombre' => "Vía inferida (trayectoria {$etiqueta})",
            'forma' => 'linea',
            'puntos' => $eje,
            'cerrada' => false,
            'ancho' => $ancho,
            'carriles' => 2,
            'sentido' => 'doble',
            'superficie' => 'asfalto',
            'linea_central' => 'discontinua',
            'acera' => in_array($zona, ['urbana', 'residencial', 'suburbana'], true),
            'berma' => in_array($zona, ['rural', 'autopista', 'montana'], true),
            'auto' => true,
        ];
    }
    return $vias;
}

// ─────────────────────────────────────────────────────────────────────────
//  Zonas
// ─────────────────────────────────────────────────────────────────────────

function escAreaPoligono(array $pts): float {
    $a = 0.0;
    $n = count($pts);
    for ($i = 0; $i < $n; $i++) {
        $j = ($i + 1) % $n;
        $a += $pts[$i][0] * $pts[$j][1] - $pts[$j][0] * $pts[$i][1];
    }
    return abs($a) / 2;
}

/** Rectángulo centrado en (x,y) con su eje "largo" orientado según el rumbo. */
function escRectangulo(float $x, float $y, float $ancho, float $largo, float $rumbo): array {
    $r = deg2rad($rumbo);
    $fx = sin($r);
    $fy = cos($r);   // eje "largo" (frente)
    $rx = cos($r);
    $ry = -sin($r);  // eje "ancho" (derecha)
    $pts = [];
    foreach ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as [$sa, $sl]) {
        $pts[] = [
            round($x + $rx * $sa * $ancho / 2 + $fx * $sl * $largo / 2, 2),
            round($y + $ry * $sa * $ancho / 2 + $fy * $sl * $largo / 2, 2),
        ];
    }
    return $pts;
}

function escNormalizarZona(array $z): ?array {
    $tipo = escEnum($z['tipo'] ?? $z['type'] ?? '', ESC_ZONA_TIPOS, ESC_ZONA_TIPOS_SIN, 'cesped');
    $pts = escPuntos($z['poligono'] ?? $z['puntos'] ?? $z['points'] ?? null, 0.5, 40);

    if (count($pts) < 3) {
        $c = escPunto($z['centro'] ?? null);
        $r = escNum($z['radio'] ?? null, null, 1.0, 120.0);
        if ($c !== null && $r !== null) {
            $pts = escCirculo($c[0], $c[1], $r, 24);
        } else {
            $p = escPunto($z);
            $an = escNum($z['ancho'] ?? null, null, 1.0, 240.0);
            $la = escNum($z['largo'] ?? null, $an, 1.0, 240.0);
            if ($p !== null && $an !== null) {
                $pts = escRectangulo($p[0], $p[1], $an, $la, escAngulo($z['angulo'] ?? 0));
            }
        }
    }
    if (count($pts) < 3 || escAreaPoligono($pts) < 4.0) {
        return null;
    }
    return ['tipo' => $tipo, 'poligono' => $pts];
}

// ─────────────────────────────────────────────────────────────────────────
//  Elementos
// ─────────────────────────────────────────────────────────────────────────

function escTipoElemento($valor): string {
    $k = escClave($valor);
    if ($k === '') {
        return 'generico';
    }
    if (in_array($k, ESC_ELEMENTOS, true)) {
        return $k;
    }
    foreach (ESC_ELEMENTOS_SIN as [$patron, $tipo]) {
        if (strpos($k, $patron) !== false) {
            return $tipo;
        }
    }
    return 'generico';
}

function escElementoBase(array $e, string $tipo, float $x, float $y, float $angulo): array {
    $el = ['tipo' => $tipo, 'x' => round($x, 2), 'y' => round($y, 2), 'angulo' => round($angulo, 1)];
    foreach (['ancho' => [0.2, 120.0], 'largo' => [0.2, 240.0], 'alto' => [0.2, 150.0]] as $campo => [$min, $max]) {
        $n = escNum($e[$campo] ?? null, null, $min, $max);
        if ($n !== null) {
            $el[$campo] = round($n, 2);
        }
    }
    $pisos = escNum($e['pisos'] ?? null, null, 1, 50);
    if ($pisos !== null) {
        $el['pisos'] = (int) round($pisos);
    }
    if ($tipo === 'semaforo') {
        $el['estado'] = escEnum($e['estado'] ?? $e['luz'] ?? '', ['rojo', 'amarillo', 'verde'],
            ['red' => 'rojo', 'yellow' => 'amarillo', 'ambar' => 'amarillo', 'green' => 'verde'], 'rojo');
    }
    if ($tipo === 'senal_velocidad') {
        $el['valor'] = (int) round(escNum($e['valor'] ?? $e['limite'] ?? $e['velocidad'] ?? null, 60.0, 10.0, 130.0));
    }
    $color = escTexto($e['color'] ?? '', 20);
    if ($color !== '') {
        $el['color'] = $color;
    }
    $etiqueta = escTexto($e['nombre'] ?? $e['etiqueta'] ?? $e['descripcion'] ?? '', 40);
    if ($tipo === 'generico' && $etiqueta === '') {
        $etiqueta = escTexto($e['tipo'] ?? '', 40);
    }
    if ($etiqueta !== '') {
        $el['etiqueta'] = $etiqueta;
    }
    return $el;
}

/** Devuelve 0..n elementos (las filas y los elementos lineales se expanden). */
function escNormalizarElemento(array $e): array {
    $tipo = escTipoElemento($e['tipo'] ?? $e['type'] ?? '');
    $lineal = in_array($tipo, ESC_ELEMENTOS_LINEALES, true);
    $linea = escPuntos($e['linea'] ?? $e['puntos'] ?? null, 0.5, 16);

    if (count($linea) >= 2) {
        $out = [];
        if ($lineal) {
            // Un tramo por segmento de la polilínea.
            for ($i = 1; $i < count($linea); $i++) {
                [$ax, $ay] = $linea[$i - 1];
                [$bx, $by] = $linea[$i];
                $len = hypot($bx - $ax, $by - $ay);
                $el = escElementoBase($e, $tipo, ($ax + $bx) / 2, ($ay + $by) / 2, escRumbo($bx - $ax, $by - $ay));
                $el['largo'] = round($len, 2);
                $out[] = $el;
            }
            return $out;
        }
        $total = escLongitud($linea);
        $cantidad = escNum($e['cantidad'] ?? null, null, 1, ESC_MAX_FILA);
        if ($cantidad === null) {
            $esp = escNum($e['espaciado'] ?? null, 10.0, 2.0, 100.0);
            $cantidad = min(ESC_MAX_FILA, max(1, (int) floor($total / $esp) + 1));
        }
        $cantidad = (int) round($cantidad);
        for ($k = 0; $k < $cantidad; $k++) {
            $d = $cantidad === 1 ? $total / 2 : $total * $k / ($cantidad - 1);
            // Ubicar la distancia $d a lo largo de la polilínea.
            for ($i = 1; $i < count($linea); $i++) {
                [$ax, $ay] = $linea[$i - 1];
                [$bx, $by] = $linea[$i];
                $seg = hypot($bx - $ax, $by - $ay);
                if ($d <= $seg + 1e-6 || $i === count($linea) - 1) {
                    $t = $seg > 0 ? min(1.0, $d / $seg) : 0.0;
                    $ang = isset($e['angulo']) ? escAngulo($e['angulo']) : escRumbo($bx - $ax, $by - $ay);
                    $out[] = escElementoBase($e, $tipo, $ax + ($bx - $ax) * $t, $ay + ($by - $ay) * $t, $ang);
                    break;
                }
                $d -= $seg;
            }
        }
        return $out;
    }

    $p = escPunto($e);
    if ($p === null) {
        $p = escPunto($e['posicion'] ?? $e['pos'] ?? null);
    }
    if ($p === null) {
        return [];
    }
    return [escElementoBase($e, $tipo, $p[0], $p[1], escAngulo($e['angulo'] ?? $e['rumbo'] ?? 0))];
}

// ─────────────────────────────────────────────────────────────────────────
//  Entrada principal
// ─────────────────────────────────────────────────────────────────────────

/**
 * Normaliza el escenario generado por la IA.
 *
 * @param mixed $crudo   Valor de "escenario" tal como lo devolvió la IA (puede faltar).
 * @param array $payload Payload completo (para frames, environment y lighting_engine).
 * @return array Escenario con forma garantizada.
 */
function normalizeEscenario($crudo, array $payload): array {
    $e = is_array($crudo) ? $crudo : [];

    // Pistas de respaldo a partir de los campos clásicos.
    $env = escClave($payload['environment'] ?? '');
    $zonaDefecto = ['rural' => 'rural', 'highway' => 'autopista', 'urban' => 'urbana'][$env] ?? 'urbana';
    $luzDefecto = escEnum($payload['lighting_engine'] ?? '', ESC_LUCES, ESC_LUCES_SIN, 'noche');

    $zona = escEnum($e['zona'] ?? $e['entorno'] ?? $e['tipo_zona'] ?? '', ESC_ZONAS, ESC_ZONAS_SIN, $zonaDefecto);
    $terrenoDefecto = in_array($zona, ['urbana', 'industrial', 'estacionamiento'], true) ? 'concreto' : 'cesped';

    $out = [
        'descripcion' => escTexto($e['descripcion'] ?? $e['description'] ?? '', 400),
        'zona' => $zona,
        'terreno' => escEnum($e['terreno'] ?? $e['suelo'] ?? '', ESC_TERRENOS, ESC_TERRENOS_SIN, $terrenoDefecto),
        'iluminacion' => escEnum($e['iluminacion'] ?? $e['luz'] ?? '', ESC_LUCES, ESC_LUCES_SIN, $luzDefecto),
        'clima' => escEnum($e['clima'] ?? $e['tiempo'] ?? '', ESC_CLIMAS, ESC_CLIMAS_SIN, 'despejado'),
        'trafico_ambiente' => escEnum($e['trafico_ambiente'] ?? $e['trafico'] ?? '', ESC_TRAFICOS, ESC_TRAFICOS_SIN, 'bajo'),
        'vias' => [],
        'zonas' => [],
        'elementos' => [],
        'origen_vias' => 'ia',
    ];

    foreach ((is_array($e['vias'] ?? null) ? $e['vias'] : []) as $v) {
        if (count($out['vias']) >= ESC_MAX_VIAS) {
            break;
        }
        if (is_array($v) && ($via = escNormalizarVia($v, $zona)) !== null) {
            $out['vias'][] = $via;
        }
    }

    foreach ((is_array($e['zonas'] ?? null) ? $e['zonas'] : []) as $z) {
        if (count($out['zonas']) >= ESC_MAX_ZONAS) {
            break;
        }
        if (is_array($z) && ($zn = escNormalizarZona($z)) !== null) {
            $out['zonas'][] = $zn;
        }
    }

    foreach ((is_array($e['elementos'] ?? null) ? $e['elementos'] : []) as $el) {
        if (!is_array($el)) {
            continue;
        }
        foreach (escNormalizarElemento($el) as $item) {
            if (count($out['elementos']) >= ESC_MAX_ELEMENTOS) {
                break 2;
            }
            $out['elementos'][] = $item;
        }
    }

    $antes = count($out['vias']);
    $out['vias'] = escInferirViasDeTrayectorias($out['vias'], $payload['animacion_actores'] ?? [], $zona);
    if (count($out['vias']) > $antes) {
        $out['origen_vias'] = $antes === 0 ? 'trayectorias' : 'ia+trayectorias';
    }

    return $out;
}
