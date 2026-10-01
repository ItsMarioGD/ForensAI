# ForensIA · Reconstrucción Forense con IA (edición XAMPP / PHP)

> Motor de Inferencia Cinemática y Reconstrucción Forense (NIC-RF) — versión
> **100 % PHP** pensada para correr en XAMPP o cualquier hosting con Apache + PHP 7.4+.

ForensIA toma un relato en lenguaje natural de un accidente vial y devuelve una
simulación 3D interactiva + un dictamen técnico, usando **Ollama** (IA local) como
motor LLM y **Three.js** para la visualización.

---

## 📋 Requisitos

| Componente | Versión mínima | Notas |
|---|---|---|
| **XAMPP** | 7.4+ (PHP 7.4 u 8.x) | Incluye Apache 2.4 y cURL |
| **Ollama** | 0.5+ | IA local que ejecuta el modelo |
| **Modelo LLM** | `llama3.1:8b` (recomendado) o el que prefieras | ~5 GB de RAM |
| **Navegador** | Chrome / Edge / Firefox recientes | Three.js + React 18 |

> **No requiere Python, FastAPI, ni Node.js.** Todo el backend es PHP puro.

---

## 🚀 Instalación paso a paso

### 1) Instalar XAMPP

1. Descarga XAMPP desde <https://www.apachefriends.org/>.
2. Instálalo (por defecto en `C:\xampp`).
3. Arranca **Apache** desde el panel de control de XAMPP.

### 2) Instalar Ollama + modelo

1. Descarga Ollama desde <https://ollama.com/download>.
2. Instálalo y verifica en una terminal:
   ```bash
   ollama --version
   ```
3. Arranca el servicio (queda en segundo plano):
   ```bash
   ollama serve
   ```
4. Descarga el modelo recomendado (5 GB):
   ```bash
   ollama pull llama3.1:8b
   ```
   > Puedes usar otro (ver `config.php` para la lista completa).

### 3) Copiar ForensIA a XAMPP

Copia toda la carpeta del proyecto a:

```
C:\xampp\htdocs\forensia\
```

Quedando así:

```
C:\xampp\htdocs\forensia\
├── index.php              ← front controller
├── .htaccess              ← reescritura Apache
├── config.php             ← config Ollama
├── lib\                   ← lógica de negocio
│   ├── SystemPrompt.php
│   ├── SceneNormalizer.php  ← limpia el escenario (mapa automático)
│   ├── JsonValidator.php
│   ├── OllamaClient.php
│   └── TurtleBuilder.php
├── controllers\           ← endpoints REST
│   ├── StatusController.php
│   ├── ModelsController.php
│   ├── SimulateController.php
│   └── TurtleController.php
└── frontend\              ← UI (HTML/CSS/JS)
    ├── index.html
    ├── app.js
    ├── map-generator.js   ← genera el mapa 3D del lugar descrito
    └── styles.css
```

### 4) Habilitar `mod_rewrite` y `curl` en XAMPP

- `mod_rewrite`: edita `C:\xampp\apache\conf\httpd.conf` y asegúrate de que esta
  línea **no** esté comentada:
  ```apache
  LoadModule rewrite_module modules/mod_rewrite.so
  ```
- `curl`: edita `C:\xampp\php\php.ini` y descomenta:
  ```ini
  extension=curl
  ```
- Reinicia Apache desde el panel de XAMPP.

### 5) Abrir la app

Entra a:

```
http://localhost/forensia/
```

Verás un indicador verde "Ollama ✓" si todo está OK. Si está rojo, abre una
terminal y ejecuta `ollama serve`.

---

## ▲ Despliegue en Vercel

El repositorio incluye `vercel.json`, así que basta con importarlo en Vercel
(o hacer push a una rama: cada push genera una URL de *preview*).

- La carpeta `frontend/` se publica como sitio estático (los `.php` no quedan
  expuestos como archivos).
- `api/index.php` corre como función PHP con el runtime comunitario
  [`vercel-php`](https://github.com/juicyfx/vercel-php) y atiende
  `/api/status`, `/api/models`, `/api/simulate` y `/api/turtle-script`.
- Límite de 60 s por petición (`maxDuration`); en Vercel la llamada a la IA
  se corta a los 55 s.
- Define `POLLINATIONS_API_KEY` en *Settings → Environment Variables* del
  proyecto para no depender de la clave de `config.php`.
- Las vistas previas pueden estar protegidas con *Vercel Authentication*: para
  mostrarlas a alguien sin cuenta, usa *Share* en la barra de Vercel o desactiva la
  protección en *Settings → Deployment Protection*.

---

## ⚙️ Configuración

Edita `config.php` (o define variables de entorno en tu hosting):

| Constante | Default | Descripción |
|---|---|---|
| `OLLAMA_URL` | `http://localhost:11434` | URL del servidor Ollama |
| `DEFAULT_MODEL` | `llama3.1:8b` | Modelo usado por defecto |
| `RECOMMENDED_MODELS` | (lista de 8) | Modelos sugeridos en el dropdown |
| `OLLAMA_GENERATE_TIMEOUT` | `180` (seg) | Timeout para generar simulación |
| `OLLAMA_CHECK_TIMEOUT` | `3` (seg) | Timeout para ping `/api/tags` |
| `OLLAMA_LIST_TIMEOUT` | `5` (seg) | Timeout para listar modelos |

Por variables de entorno (recomendado en hosting):

```bash
set OLLAMA_URL=http://mi-ollama:11434
set OLLAMA_MODEL=qwen2.5:7b
```

---

## 🌐 Endpoints de la API

Todos devuelven JSON (excepto `/api/turtle-script` que devuelve `text/plain`).

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/status` | ¿Ollama responde? |
| `GET` | `/api/models` | Modelos instalados + recomendados |
| `POST` | `/api/simulate` | Genera simulación desde un relato |
| `POST` | `/api/turtle-script` | Descarga script Python (Turtle) |

### Ejemplos

**Status:**
```bash
curl http://localhost/forensia/api/status
# → {"ollama_running":true,"ollama_url":"http://localhost:11434","version":"3.0.0-php-xampp"}
```

**Simulate:**
```bash
curl -X POST http://localhost/forensia/api/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "relato": "Vehículo 1 (sedán rojo) circulaba de sur a norte a 70 km/h y chocó con el Vehículo 2 que cruzó en rojo.",
    "model": "llama3.1:8b",
    "modo_mapa": "auto"
  }'
```

`modo_mapa` es opcional: `"auto"` (por defecto, la respuesta incluye `escenario`) o
`"plantilla"` (uno de los 4 mapas modelados).

**Turtle (descarga .py):**
```bash
curl -X POST http://localhost/forensia/api/turtle-script \
  -H "Content-Type: application/json" \
  -d @simulacion.json -o forensia_simulacion.py
python forensia_simulacion.py
```

---

## 🗺️ Mapa del siniestro: automático o plantilla

En la barra lateral, la tarjeta **"Mapa del siniestro"** ofrece dos modos (la
elección se recuerda en el navegador):

| Modo | Qué hace |
|---|---|
| **🤖 Automático** (por defecto) | La IA lee el relato y **reconstruye el lugar**: vías (rectas, curvas, cruces, intersecciones en T, rotondas), número de carriles, superficie (asfalto, adoquín, tierra...), aceras y bermas, edificios, casas, árboles, postes, semáforos, señales, muros, guardarraíles, autos estacionados, zonas (parques, ríos, bosques...), iluminación (día, atardecer, noche...) y clima (lluvia, niebla, nieve). El navegador lo genera en 3D. |
| **📐 Plantillas** | Usa uno de los 4 mapas modelados: intersección, recta, curva o rotonda (comportamiento anterior). |

Con una simulación automática en pantalla, los botones **🗺️ Mapa IA / 📐 Plantilla**
del visor permiten comparar la misma reconstrucción sobre el mapa generado o sobre la
plantilla más parecida. La tarjeta **"Escenario reconstruido por la IA"** muestra cómo
interpretó la IA el lugar.

**Robustez:**
- `lib/SceneNormalizer.php` traduce sinónimos (`"farola"` → `poste_luz`, `"pasto"` → `cesped`,
  `"doble línea amarilla"` → `doble_amarilla`...), acota números y coordenadas, expande
  filas de elementos y rotondas definidas por centro y radio.
- Si la IA no describe las vías (o no cubren el recorrido de V1/V2 antes del impacto),
  se **infieren a partir de las trayectorias** y se marcan como "inferidas".
- Si el relato detalla poco el entorno, el generador lo completa según la zona
  (edificios en zona urbana, casas en residencial, vegetación en rural/montaña,
  guardarraíles en autopista), sin invadir la calzada ni las trayectorias.
- Los cruces reciben automáticamente pasos de cebra (zonas urbanas) y líneas de PARE.

El script Python (Turtle) descargable también dibuja el escenario reconstruido.

### Campo `escenario` (modo automático)

```json
"escenario": {
  "descripcion": "Cruce semaforizado en zona comercial, de noche",
  "zona": "urbana", "terreno": "concreto", "iluminacion": "noche", "clima": "despejado",
  "trafico_ambiente": "medio",
  "vias": [
    { "nombre": "Av. Libertador", "puntos": [[0,-110],[0,110]], "ancho": 14, "carriles": 4,
      "sentido": "doble", "superficie": "asfalto", "linea_central": "doble_amarilla",
      "acera": true, "berma": false },
    { "nombre": "Rotonda", "centro": [0,40], "radio": 20, "ancho": 9 }
  ],
  "zonas": [ { "tipo": "parque", "poligono": [[14,14],[60,14],[60,55],[14,55]] } ],
  "elementos": [
    { "tipo": "semaforo", "x": 8.5, "y": -8, "estado": "rojo" },
    { "tipo": "poste_luz", "linea": [[-9.5,-100],[-9.5,-15]], "cantidad": 4 }
  ]
}
```

Coordenadas en metros (+x = este, +y = norte), ángulos como rumbo (0 = norte, 90 = este),
el impacto cerca de (0,0) y circulación por la derecha.

---

## 🧠 Arquitectura

```
┌─────────────┐    fetch('/api/...')    ┌──────────────┐    cURL    ┌─────────┐
│  Navegador  │ ◄────────────────────► │  PHP (XAMPP) │ ◄────────► │ Ollama  │
│ React+Three │                        │  index.php   │            │ :11434  │
└─────────────┘                        └──────────────┘            └─────────┘
                                              │
                                              ├─ /api/status         → OllamaClient::checkOllamaRunning
                                              ├─ /api/models         → OllamaClient::listLocalModels
                                              ├─ /api/simulate       → OllamaClient::generateSimulation
                                              └─ /api/turtle-script  → TurtleBuilder::buildTurtleScript
```

El SYSTEM_PROMPT canónico (núcleo NIC-RF) vive en `lib/SystemPrompt.php` —
idéntico al de la versión Python original.

---

## 🐛 Troubleshooting

| Problema | Solución |
|---|---|
| Indicador "Ollama ✗ Inactivo" | Abre una terminal y corre `ollama serve` |
| HTTP 500 al simular | Revisa `xampp\apache\logs\error.log` |
| HTTP 504 (timeout) | El modelo se está cargando. Vuelve a intentar en 30 s |
| HTTP 503 con "modelo no instalado" | `ollama pull llama3.1:8b` |
| Página en blanco | Verifica que `mod_rewrite` esté habilitado en `httpd.conf` |
| CORS error en consola | El `.htaccess` ya configura CORS, pero si usas un proxy reverso, pasa el header `Origin` |

---

## 📂 Estructura de carpetas (resumen)

```
forensia/
├── index.php             ← front controller / router
├── .htaccess             ← reescritura + seguridad
├── config.php            ← constantes del sistema
├── lib/                  ← núcleo (SystemPrompt, SceneNormalizer, JsonValidator, OllamaClient, TurtleBuilder)
├── controllers/          ← endpoints REST delgados
├── frontend/             ← UI estática servida directamente
└── legacy/               ← versión Python original (sólo referencia histórica)
```

---

## 📜 Licencia

ForensIA © 2024-2026 — Mario González Dávila.
Versión PHP/XAMPP portada con paridad funcional con la versión Python.
