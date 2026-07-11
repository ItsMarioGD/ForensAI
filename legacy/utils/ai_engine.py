"""
ai_engine.py
============
Motor de Inferencia Cinemática y Reconstrucción Forense (NIC-RF) usando
un modelo local servido por Ollama (http://localhost:11434).

La función principal transforma un relato en lenguaje natural de un
accidente de tránsito en un gemelo digital paramétrico en JSON.
"""

import json
import re
from typing import Optional

import requests


# ---------------------------------------------------------------------------
# Configuración por defecto de Ollama
# ---------------------------------------------------------------------------
DEFAULT_OLLAMA_URL = "http://localhost:11434"
DEFAULT_MODEL = "llama3.1:8b"

# Lista de modelos recomendados, ordenados de mejor -> más liviano.
RECOMMENDED_MODELS = [
    "llama3.1:8b",      # Mejor calidad (4.9 GB) - RECOMENDADO
    "llama3.1:70b",     # Máxima calidad (requiere ~40 GB RAM)
    "qwen2.5:14b",      # Alternativa excelente (9 GB)
    "qwen2.5:7b",       # Liviano y preciso (4.7 GB)
    "mistral:7b",       # Rápido y eficiente (4.1 GB)
    "gemma2:9b",        # Google, buen razonamiento (5.4 GB)
    "phi3:14b",         # Microsoft, compacto y capaz (7.9 GB)
    "llama3.2:3b",      # Ultra liviano (2.0 GB)
]


# ---------------------------------------------------------------------------
# System Prompt: Núcleo de Inferencia Cinemática y Reconstrucción Forense
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """ROL Y OBJETIVO:
Eres el motor de procesamiento lógico de "ForensIA", un simulador forense 3D hiperrealista. Tu función es analizar el "Relato del Siniestro" del usuario y traducirlo en parámetros y variables exactas para el motor de renderizado y físicas, evitando siempre los valores por defecto.

REGLAS ESTRUCTURALES OBLIGATORIAS:

INCLUIDE EXACTAMENTE ESTOS CAMPOS en el JSON de salida:

1. infraestructura: (string) - uno de: "interseccion_cruciforme", "recta", "curva", "rotonda"
2. dictamen_tecnico: (string) - Explicación forense sintetizada de cómo ocurrió el hecho
3. v1_color: (string) - "rojo" (siempre)
4. v2_color: (string) - "azul" (siempre)
5. v1_tipo: (string) - "sedan" (siempre)
6. v2_tipo: (string) - "suv" (siempre)

PARÁMETROS DE RENDERIZADO DINÁMICOS (INCLUIDOS SIEMPRE):
7. vehicle_model: "high_poly" (SIEMPRE)
8. smooth_shading: true (SIEMPRE)
9. environment: (string) "rural | urban | highway" (basado en relato)
10. lighting_engine: (string) "daylight | night | overcast | sunset" (basado en hora)

PARÁMETROS DE FÍSICA DINÁMICA (INCLUIDOS SIEMPRE):
11. physics_engine: "advanced" (SIEMPRE)
12. part_detachment: true (SIEMPRE)
13. tire_marks: true (SIEMPRE)

14. animacion_actores: (array) - Mínimo 2 frames, cada uno con:
   - segundo (float)
   - v1_x (float), v1_y (float), v1_angulo (float)
   - v2_x (float), v2_y (float), v2_angulo (float)

REGLAS DE CONTENIDO:

- RESPONDE ÚNICAMENTE con el objeto JSON (sin texto adicional)
- NO uses markdown o bloques de código
- NO envuelvas el JSON en contenedores
- El JSON debe estar en la raíz de la respuesta
- INCLUYE TODOS los 14 campos exactamente como se especifican arriba
- NO omitas NINGÚN campo obligatorios

FORMATO DE SALIDA:
Al procesar el relato del usuario, siempre debes responder ÚNICAMENTE con un objeto JSON válido que incluya TODOS los 14 campos de arriba.
El orden de los campos no importa, pero todos deben estar presentes."""


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
def check_ollama_running(base_url: str = DEFAULT_OLLAMA_URL,
                        timeout: int = 3) -> bool:
    """Verifica si el servidor Ollama responde."""
    try:
        r = requests.get(f"{base_url}/api/tags", timeout=timeout)
        return r.status_code == 200
    except requests.RequestException:
        return False


def list_local_models(base_url: str = DEFAULT_OLLAMA_URL,
                      timeout: int = 5) -> list[dict]:
    """
    Devuelve la lista de modelos instalados en Ollama.
    Cada elemento: {"name": "llama3.1:8b", "size": 4900000000, ...}
    """
    try:
        r = requests.get(f"{base_url}/api/tags", timeout=timeout)
        r.raise_for_status()
        data = r.json()
        return data.get("models", [])
    except requests.RequestException:
        return []


def _extract_json_block(text: str) -> Optional[str]:
    """
    Intenta extraer un objeto JSON de un texto que podría contener prosa
    adicional (los modelos Ollama a veces agregan explicaciones).
    """
    text = text.strip()

    # 1) ¿El texto completo es JSON puro?
    if text.startswith("{"):
        # Buscar la última llave de cierre balanceada
        depth = 0
        for i, ch in enumerate(text):
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return text[:i + 1]
        return text

    # 2) Buscar primer '{' y extraer bloque balanceado
    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    for i in range(start, len(text)):
        ch = text[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
    return None


def _validate_payload(payload: dict) -> bool:
    """Verifica que el JSON de la IA tenga la estructura mínima esencial para el frontend."""
    if not isinstance(payload, dict):
        return False
    
    # Campos mínimamente necesarios para el frontend
    required_top_level = {
        "infraestructura", "dictamen_tecnico", "animacion_actores"
    }
    
    # Validación mínima: la IA debe incluir al menos estos campos
    if not required_top_level.issubset(payload.keys()):
        return False
    
    # Campos adicionales permitidos:
    # Campo explícitos del reporte forense
    if "v1_color" in payload and not isinstance(payload["v1_color"], str):
        return False
    if "v2_color" in payload and not isinstance(payload["v2_color"], str):
        return False
    if "v1_tipo" in payload and not isinstance(payload["v1_tipo"], str):
        return False
    if "v2_tipo" in payload and not isinstance(payload["v2_tipo"], str):
        return False
    
    # Campos de realismo dinámico (opcionales para compatibilidad)
    if "vehicle_model" in payload and not isinstance(payload["vehicle_model"], str):
        return False
    if "smooth_shading" in payload and not isinstance(payload["smooth_shading"], bool):
        return False
    if "environment" in payload and not isinstance(payload["environment"], str):
        return False
    if "lighting_engine" in payload and not isinstance(payload["lighting_engine"], str):
        return False
    if "physics_engine" in payload and not isinstance(payload["physics_engine"], str):
        return False
    if "part_detachment" in payload and not isinstance(payload["part_detachment"], bool):
        return False
    if "tire_marks" in payload and not isinstance(payload["tire_marks"], bool):
        return False
    
    # Validar estructura de animacion_actores
    if not isinstance(payload["animacion_actores"], list) or len(payload["animacion_actores"]) < 2:
        return False

    required_keys = {"segundo", "v1_x", "v1_y", "v1_angulo",
                     "v2_x", "v2_y", "v2_angulo"}
    
    # Verificar que cada frame tenga los campos esenciales
    for frame in payload["animacion_actores"]:
        if not isinstance(frame, dict):
            return False
        if not required_keys.issubset(frame.keys()):
            return False
        # Validar tipos numéricos
        try:
            float(frame["segundo"])
            float(frame["v1_x"]); float(frame["v1_y"]); float(frame["v1_angulo"])
            float(frame["v2_x"]); float(frame["v2_y"]); float(frame["v2_angulo"])
        except (TypeError, ValueError):
            return False
    
    return True


def _coerce_types(payload: dict) -> dict:
    """Asegura que los valores numéricos sean float/int y no strings."""
    for frame in payload["animacion_actores"]:
        for key in ("segundo", "v1_x", "v1_y", "v1_angulo",
                    "v2_x", "v2_y", "v2_angulo"):
            try:
                frame[key] = float(frame[key])
            except (TypeError, ValueError):
                pass
    return payload


# ---------------------------------------------------------------------------
# Función principal
# ---------------------------------------------------------------------------
def generate_simulation(relato: str,
                        model: str = DEFAULT_MODEL,
                        base_url: str = DEFAULT_OLLAMA_URL,
                        timeout: int = 180) -> dict:
    """
    Envía el relato a Ollama y devuelve un dict validado con la simulación.

    Parameters
    ----------
    relato : str
        Descripción en lenguaje natural del accidente.
    model : str
        Nombre del modelo Ollama (ej. "llama3.1:8b").
    base_url : str
        URL del servidor Ollama (por defecto http://localhost:11434).
    timeout : int
        Tiempo máximo de espera en segundos.

    Returns
    -------
    dict
        Estructura validada con la simulación.

    Raises
    ------
    RuntimeError
        Si Ollama no responde, el modelo no existe, la respuesta no es
        JSON válido o no cumple el esquema.
    """
    if not relato or not relato.strip():
        raise RuntimeError("El relato del accidente está vacío.")

    if not check_ollama_running(base_url):
        raise RuntimeError(
            f"❌ Ollama no responde en {base_url}.\n\n"
            "Verifica que el servicio esté ejecutándose con:\n"
            "    ollama serve\n\n"
            "Y que el modelo esté descargado:\n"
            f"    ollama pull {model}"
        )

    # Verificar que el modelo esté instalado localmente
    modelos_locales = [m.get("name", "") for m in list_local_models(base_url)]
    # Ollama a veces devuelve "llama3.1:8b" como "llama3.1:latest" → coincidencia laxa
    modelo_disponible = any(
        m == model or m.split(":")[0] == model.split(":")[0]
        for m in modelos_locales
    )
    if modelos_locales and not modelo_disponible:
        raise RuntimeError(
            f"❌ El modelo '{model}' no está instalado en Ollama.\n\n"
            f"Modelos disponibles: {', '.join(modelos_locales)}\n\n"
            f"Para descargarlo ejecuta:\n    ollama pull {model}"
        )

    user_prompt = (
        "Analiza el siguiente relato de accidente de tránsito y genera "
        "la simulación forense en JSON estricto, respetando EXACTAMENTE "
        "la estructura indicada en las reglas.\n\n"
        f"RELATO:\n{relato.strip()}"
    )

    payload_request = {
        "model": model,
        "prompt": user_prompt,
        "system": SYSTEM_PROMPT,
        "stream": False,
        "options": {
            "temperature": 0.1,        # Bajo para máxima consistencia JSON
            "top_p": 0.9,
            "num_predict": 2048,
            "format": "json",          # Fuerza salida JSON en Ollama >= 0.5
        },
    }

    try:
        response = requests.post(
            f"{base_url}/api/generate",
            json=payload_request,
            timeout=timeout,
        )
    except requests.Timeout:
        raise RuntimeError(
            f"⏱️ Timeout ({timeout}s) esperando a Ollama. "
            "El modelo puede estar cargándose o el relato es muy largo."
        )
    except requests.RequestException as exc:
        raise RuntimeError(f"❌ Error de conexión con Ollama: {exc}") from exc

    if response.status_code != 200:
        # Ollama devuelve mensajes de error útiles (modelo no existe, etc.)
        try:
            err = response.json().get("error", response.text)
        except Exception:
            err = response.text
        raise RuntimeError(
            f"❌ Ollama devolvió HTTP {response.status_code}: {err}"
        )

    try:
        data = response.json()
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"❌ Respuesta no-JSON de Ollama: {response.text[:300]}") from exc

    raw_text = (data.get("response") or "").strip()
    if not raw_text:
        raise RuntimeError("❌ Ollama devolvió una respuesta vacía.")

    # 1) Intento directo de parseo
    payload: Optional[dict] = None
    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError:
        # 2) Extraer bloque JSON de un texto con prosa
        bloque = _extract_json_block(raw_text)
        if bloque:
            try:
                payload = json.loads(bloque)
            except json.JSONDecodeError as exc:
                raise RuntimeError(
                    f"❌ La IA no devolvió un JSON válido.\n"
                    f"Fragmento recibido:\n{raw_text[:500]}"
                ) from exc

    if payload is None:
        raise RuntimeError(
            f"❌ No se encontró JSON en la respuesta de Ollama:\n{raw_text[:500]}"
        )

    # 3) Validación de esquema
    if not _validate_payload(payload):
        raise RuntimeError(
            "❌ El JSON devuelto no cumple el esquema esperado.\n"
            "Faltan claves obligatorias: 'infraestructura', 'dictamen_tecnico' "
            "o 'animacion_actores' con la estructura de frames correcta.\n\n"
            f"Recibido:\n{json.dumps(payload, indent=2, ensure_ascii=False)[:800]}"
        )

    return _coerce_types(payload)
