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
    "model": "llama3.1:8b"
  }'
```

**Turtle (descarga .py):**
```bash
curl -X POST http://localhost/forensia/api/turtle-script \
  -H "Content-Type: application/json" \
  -d @simulacion.json -o forensia_simulacion.py
python forensia_simulacion.py
```

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
├── lib/                  ← núcleo (SystemPrompt, JsonValidator, OllamaClient, TurtleBuilder)
├── controllers/          ← endpoints REST delgados
├── frontend/             ← UI estática servida directamente
└── legacy/               ← versión Python original (sólo referencia histórica)
```

---

## 📜 Licencia

ForensIA © 2024-2026 — Mario González Dávila.
Versión PHP/XAMPP portada con paridad funcional con la versión Python.
