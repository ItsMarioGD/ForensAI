"""
ForensIA - App
==============
Aplicación web con Streamlit para que un investigador de accidentes de
tránsito describa un siniestro en lenguaje natural y obtenga
automáticamente una simulación visual animada.

Ejecución local:
    streamlit run app.py
"""

import sys
from pathlib import Path

# Permitir imports del paquete utils/ sin instalación como paquete
PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from utils.ai_engine import (
    DEFAULT_MODEL,
    RECOMMENDED_MODELS,
    check_ollama_running,
    generate_simulation,
    list_local_models,
)


# ---------------------------------------------------------------------------
# Configuración de la página
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="ForensIA · Reconstrucción Forense de Accidentes",
    page_icon="🚓",
    layout="wide",
    initial_sidebar_state="expanded",
)


# ---------------------------------------------------------------------------
# Estilos CSS personalizados (look forense / profesional)
# ---------------------------------------------------------------------------
CUSTOM_CSS = """
<style>
    .main-header {
        background: linear-gradient(90deg, #0f2027 0%, #203a43 50%, #2c5364 100%);
        padding: 1.5rem 1.5rem;
        border-radius: 12px;
        color: #ffffff;
        margin-bottom: 1.5rem;
        border: 1px solid #2c5364;
    }
    .main-header h1 {
        margin: 0;
        font-size: 1.9rem;
    }
    .main-header p {
        margin: 0.4rem 0 0 0;
        opacity: 0.85;
        font-size: 1rem;
    }
    .stButton>button {
        background-color: #c0392b;
        color: #ffffff;
        font-weight: 700;
        font-size: 1.05rem;
        border-radius: 8px;
        padding: 0.65rem 1.2rem;
        border: none;
    }
    .stButton>button:hover {
        background-color: #e74c3c;
        color: #ffffff;
    }
    .dictamen-box {
        background-color: #0e3a1f;
        color: #e6ffe6;
        padding: 1rem 1.2rem;
        border-left: 5px solid #2ecc71;
        border-radius: 6px;
        font-size: 1.02rem;
        line-height: 1.5;
    }
    .infra-tag {
        display: inline-block;
        background-color: #2c3e50;
        color: #ffffff;
        padding: 0.25rem 0.75rem;
        border-radius: 999px;
        font-size: 0.85rem;
        margin-bottom: 0.8rem;
    }
</style>
"""
st.markdown(CUSTOM_CSS, unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Sidebar: configuración de Ollama
# ---------------------------------------------------------------------------
with st.sidebar:
    st.header("⚙️ Configuración de Ollama")
    st.caption("Modelo local — sin API Key, todo se ejecuta en tu máquina.")

    # Detectar modelos instalados
    modelos_instalados = [m.get("name", "") for m in list_local_models()]
    ollama_ok = check_ollama_running()

    if ollama_ok:
        st.success(f"✅ Ollama activo ({len(modelos_instalados)} modelo(s) instalado(s))")
    else:
        st.error(
            "❌ Ollama no responde en `http://localhost:11434`.\n\n"
            "Inícialo con:\n```\nollama serve\n```"
        )

    # Selector: priorizar modelos instalados, si los hay
    if modelos_instalados:
        opciones = modelos_instalados + [m for m in RECOMMENDED_MODELS
                                         if m not in modelos_instalados]
        # Default: primer modelo instalado o el recomendado por defecto
        try:
            idx_default = opciones.index(DEFAULT_MODEL) if DEFAULT_MODEL in opciones else 0
        except ValueError:
            idx_default = 0
        modelo_elegido = st.selectbox(
            "🧠 Modelo Ollama",
            options=opciones,
            index=idx_default,
            help="Modelos en negrita ya están descargados.",
        )
    else:
        modelo_elegido = st.selectbox(
            "🧠 Modelo Ollama (ninguno instalado todavía)",
            options=RECOMMENDED_MODELS,
            index=0,
            help="Para usarlo primero ejecuta: ollama pull <modelo>",
        )
        st.info(
            f"💡 Para descargar **{modelo_elegido}** ejecuta:\n"
            f"```\nollama pull {modelo_elegido}\n```"
        )

    ollama_url = st.text_input(
        "URL del servidor Ollama",
        value="http://localhost:11434",
        disabled=not ollama_ok,
    )

    st.divider()
    st.subheader("ℹ️ Acerca de")
    st.write(
        "**ForensIA** usa IA generativa local (Ollama) + física newtoniana "
        "básica para transformar un relato en una simulación forense animada."
    )
    st.caption(
        "Modelos recomendados (mayor → menor calidad/recursos):\n"
        "- `llama3.1:8b` ⭐ (4.9 GB) — equilibrio ideal\n"
        "- `qwen2.5:7b` (4.7 GB) — excelente alternativa\n"
        "- `phi3:14b` (7.9 GB) — muy capaz\n"
        "- `llama3.2:3b` (2.0 GB) — ultra liviano"
    )


# ---------------------------------------------------------------------------
# Encabezado principal
# ---------------------------------------------------------------------------
st.markdown(
    """
    <div class="main-header">
        <h1>🚓 ForensIA · Reconstrucción Forense de Accidentes Viales</h1>
        <p>Describe el siniestro en lenguaje natural. El motor NIC-RF generará
        la simulación paramétrica y el dictamen técnico.</p>
    </div>
    """,
    unsafe_allow_html=True,
)


# ---------------------------------------------------------------------------
# Formulario de entrada del relato
# ---------------------------------------------------------------------------
st.subheader("📝 Relato del siniestro")

example_relato = (
    "Eran las 19:30 en una intersección con semáforo en el cruce de Av. "
    "Libertador y Calle 5. El Vehículo 1 (sedán rojo) circulaba de sur a "
    "norte por Av. Libertador a unos 70 km/h. El Vehículo 2 (camioneta "
    "negra) circulaba de oeste a este por Calle 5 a unos 50 km/h. El "
    "Vehículo 1 ignoró el semáforo en rojo e impactó de lleno el lateral "
    "derecho del Vehículo 2. Tras el impacto, el Vehículo 2 fue empujado "
    "hacia el noreste unos 6 metros y el Vehículo 1 quedó detenido en la "
    "intersección con daños frontales severos."
)

relato = st.text_area(
    "Pegue o escriba aquí el acta policial, testimonio o descripción informal:",
    value=example_relato,
    height=240,
    placeholder="Ej.: El conductor del vehículo 1 dobló a la izquierda sin ceder el paso...",
)

col_btn_1, col_btn_2 = st.columns([1, 3])
with col_btn_1:
    generar = st.button("🚨 Generar Simulación Forense", use_container_width=True)
with col_btn_2:
    limpiar = st.button("🧹 Limpiar resultado", use_container_width=True)


# ---------------------------------------------------------------------------
# Acciones
# ---------------------------------------------------------------------------
if limpiar:
    st.session_state.pop("simulacion", None)
    st.rerun()


# Importar el nuevo modelo de vehículos
from utils.vehicles import Vehicle, Scene

def build_animation_figure(animacion: list) -> go.Figure:
    """
    Construye una figura Plotly con animación de frames de los vehículos
    representados como flechas (ángulos respetan v1_angulo / v2_angulo).
    """
    # Convertir a DataFrame manteniendo compatibilidad con el API actual
    df = pd.DataFrame(animacion)

    # Invertimos el eje Y para que el norte (ángulos) sea coherente con
    # la convención cartesiana usual.
    df["v1_y_plot"] = -df["v1_y"]
    df["v2_y_plot"] = -df["v2_y"]

    segundos = sorted(df["segundo"].unique().tolist())

    fig = go.Figure()

    # Trazas placeholder; los datos se sobreescriben por frame
    fig.add_trace(go.Scatter(
        x=[df["v1_x"].iloc[0]],
        y=[df["v1_y_plot"].iloc[0]],
        mode="markers+text",
        marker=dict(symbol="arrow", size=28, color="#e74c3c",
                    line=dict(color="#7b1f15", width=2),
                    angle=df["v1_angulo"].iloc[0],
                    angleref="up"),
        name="Vehículo 1",
        text=["V1"],
        textposition="middle center",
        textfont=dict(color="white", size=12, family="Arial Black"),
    ))

    fig.add_trace(go.Scatter(
        x=[df["v2_x"].iloc[0]],
        y=[df["v2_y_plot"].iloc[0]],
        mode="markers+text",
        marker=dict(symbol="arrow", size=28, color="#2c3e50",
                    line=dict(color="#0f2027", width=2),
                    angle=df["v2_angulo"].iloc[0],
                    angleref="up"),
        name="Vehículo 2",
        text=["V2"],
        textposition="middle center",
        textfont=dict(color="white", size=12, family="Arial Black"),
    ))

    # Trayectorias (líneas estáticas) - tomadas del último frame
    fig.add_trace(go.Scatter(
        x=df["v1_x"], y=df["v1_y_plot"],
        mode="lines",
        line=dict(color="#e74c3c", width=2, dash="dot"),
        name="Trayectoria V1",
        showlegend=True,
    ))
    fig.add_trace(go.Scatter(
        x=df["v2_x"], y=df["v2_y_plot"],
        mode="lines",
        line=dict(color="#2c3e50", width=2, dash="dot"),
        name="Trayectoria V2",
        showlegend=True,
    ))

    # Construir frames para la animación
    frames = []
    for t in segundos:
        sub = df[df["segundo"] == t]
        if sub.empty:
            continue
        row = sub.iloc[0]
        frames.append(go.Frame(
            data=[
                go.Scatter(
                    x=[row["v1_x"]],
                    y=[row["v1_y_plot"]],
                    marker=dict(symbol="arrow", size=28, color="#e74c3c",
                                line=dict(color="#7b1f15", width=2),
                                angle=row["v1_angulo"],
                                angleref="up"),
                ),
                go.Scatter(
                    x=[row["v2_x"]],
                    y=[row["v2_y_plot"]],
                    marker=dict(symbol="arrow", size=28, color="#2c3e50",
                                line=dict(color="#0f2027", width=2),
                                angle=row["v2_angulo"],
                                angleref="up"),
                ),
                go.Scatter(x=df["v1_x"], y=df["v1_y_plot"],
                           mode="lines",
                           line=dict(color="#e74c3c", width=2, dash="dot")),
                go.Scatter(x=df["v2_x"], y=df["v2_y_plot"],
                           mode="lines",
                           line=dict(color="#2c3e50", width=2, dash="dot")),
            ],
            name=f"t={t:.2f}s",
        ))

    fig.frames = frames

    # Calcular rango del plano con margen
    all_x = pd.concat([df["v1_x"], df["v2_x"]])
    all_y = pd.concat([df["v1_y_plot"], df["v2_y_plot"]])
    x_pad = max(5, (all_x.max() - all_x.min()) * 0.15)
    y_pad = max(5, (all_y.max() - all_y.min()) * 0.15)

    fig.update_layout(
        title="🛣️ Simulación Forense Animada (X, Y en metros)",
        xaxis=dict(
            title="X (metros)",
            zeroline=True, zerolinecolor="#7f8c8d",
            range=[all_x.min() - x_pad, all_x.max() + x_pad],
            scaleanchor="y", scaleratio=1,
            gridcolor="#ecf0f1",
        ),
        yaxis=dict(
            title="Y (metros)",
            zeroline=True, zerolinecolor="#7f8c8d",
            range=[all_y.min() - y_pad, all_y.max() + y_pad],
            gridcolor="#ecf0f1",
        ),
        plot_bgcolor="#f7f9fa",
        paper_bgcolor="#ffffff",
        height=620,
        legend=dict(orientation="h", yanchor="bottom", y=1.02,
                    xanchor="right", x=1),
        updatemenus=[dict(
            type="buttons",
            showactive=False,
            y=0, x=0.5, xanchor="center",
            buttons=[
                dict(label="▶ Reproducir",
                     method="animate",
                     args=[None, {"frame": {"duration": 700, "redraw": True},
                                  "fromcurrent": True,
                                  "transition": {"duration": 200}}]),
                dict(label="⏸ Pausar",
                     method="animate",
                     args=[[None], {"frame": {"duration": 0, "redraw": False},
                                    "mode": "immediate",
                                    "transition": {"duration": 0}}]),
            ],
        )],
        sliders=[dict(
            steps=[dict(args=[[f.name], {"frame": {"duration": 0, "redraw": True},
                                       "mode": "immediate",
                                       "transition": {"duration": 0}}],
                         label=f.name, method="animate")
                   for f in frames],
            x=0.05, len=0.9, xanchor="left",
            y=0, yanchor="top",
            currentvalue=dict(prefix="Tiempo: ", visible=True, xanchor="right"),
            transition=dict(duration=0),
        )],
    )

    return fig


if generar:
    if not relato or not relato.strip():
        st.error("❌ Por favor, ingrese un relato del siniestro antes de generar la simulación.")
    elif not ollama_ok:
        st.error("❌ Ollama no está activo. Inícialo con `ollama serve` en una terminal.")
    else:
        with st.spinner(
            f"🧠 Procesando relato con {modelo_elegido} "
            "(la primera inferencia puede tardar mientras el modelo se carga)..."
        ):
            try:
                payload = generate_simulation(
                    relato=relato,
                    model=modelo_elegido,
                    base_url=ollama_url,
                )
                st.session_state["simulacion"] = payload
            except RuntimeError as exc:
                st.error(f"❌ No se pudo generar la simulación:\n\n{exc}")
            except Exception as exc:  # red de seguridad
                st.error(f"❌ Error inesperado: {exc}")


# ---------------------------------------------------------------------------
# Render del resultado
# ---------------------------------------------------------------------------
if "simulacion" in st.session_state:
    payload = st.session_state["simulacion"]

    st.divider()
    st.subheader("📋 Dictamen Técnico del Investigador IA")

    infra = payload.get("infraestructura", "desconocida")
    st.markdown(
        f"<span class='infra-tag'>🛣️ Infraestructura inferida: {infra}</span>",
        unsafe_allow_html=True,
    )
    dictamen = payload.get("dictamen_tecnico", "Sin dictamen disponible.")
    st.markdown(
        f"<div class='dictamen-box'>{dictamen}</div>",
        unsafe_allow_html=True,
    )

    st.subheader("🎬 Simulación Forense Animada")

    try:
        fig = build_animation_figure(payload["animacion_actores"])
        st.plotly_chart(fig, use_container_width=True)
    except Exception as exc:
        st.error(f"❌ Error al renderizar la simulación: {exc}")

    with st.expander("🔍 Ver datos crudos devueltos por la IA"):
        st.json(payload)
