
"""
Thermodynamic Engine Visualizer v6
==================================

Responsive desktop GUI version.

WHY V6
------
Previous versions placed Matplotlib widgets at absolute figure coordinates.
That can cause overlap or off-screen controls when:
- the window is resized,
- display scaling changes,
- the OS toolbar/title bar changes available height,
- the user runs on a smaller laptop screen.

V6 keeps the responsive interface and also uses the DeHoff work sign convention:
- a native, scrollable Tk control sidebar,
- a Matplotlib visualization canvas,
- an independent status bar.

No control widget is drawn on top of a plot.

WORK SIGN CONVENTION
--------------------
This version follows DeHoff:
    Delta U = Q + W
with mechanical work defined positive when work is done ON the system.
For reversible P-V work:
    delta W = -P_ext dV
Thus expansion gives W < 0, compression gives W > 0, and a
power-producing heat-engine cycle has W_cycle < 0.

MODES
-----
1) Reversible Carnot heat engine
2) Four-stroke spark-ignition one-zone educational engine

DEPENDENCIES
------------
numpy
matplotlib
tkinter (normally included with standard Python distributions)

RUN
---
python thermo_engine_visualizer_v6.py

PHYSICS VALIDATION
------------------
python thermo_engine_visualizer_v6.py --self-test

STATIC MAIN-CANVAS PREVIEWS
---------------------------
python thermo_engine_visualizer_v6.py --snapshot carnot carnot.png
python thermo_engine_visualizer_v6.py --snapshot engine engine.png
"""

from __future__ import annotations

import argparse
import math
import sys
import numpy as np

import matplotlib
import matplotlib.pyplot as plt
from matplotlib.figure import Figure
from matplotlib.patches import Rectangle, Circle, FancyArrowPatch


R = 8.314462618  # J mol^-1 K^-1


# ============================================================
# PHYSICS
# ============================================================

def slider_crank_displacement(theta, crank_radius=1.0, rod_length=3.5):
    """Slider displacement from top dead center."""
    theta = np.asarray(theta, dtype=float)
    under = rod_length**2 - (crank_radius * np.sin(theta))**2
    under = np.maximum(under, 0.0)

    return (
        crank_radius * (1.0 - np.cos(theta))
        + rod_length
        - np.sqrt(under)
    )


def wiebe_fraction(crank_deg, start_deg=350.0, duration_deg=60.0, a=5.0, m=2.0):
    """Normalized Wiebe-type burned fraction."""
    crank_deg = np.asarray(crank_deg, dtype=float)
    z = np.clip((crank_deg - start_deg) / duration_deg, 0.0, 1.0)
    raw = 1.0 - np.exp(-a * z ** (m + 1.0))
    return raw / (1.0 - np.exp(-a))


def integrate_work_dehoff(P, V):
    """
    Mechanical work using the DeHoff sign convention.

    DeHoff convention:
        W > 0  : work done ON the system by the surroundings
        W < 0  : work done BY the system on the surroundings

    For reversible/quasi-static P-V work:
        delta W = -P_ext dV
    and for the idealized reversible paths here P_ext = P.
    """
    P = np.asarray(P, dtype=float)
    V = np.asarray(V, dtype=float)
    return float(-np.sum(0.5 * (P[1:] + P[:-1]) * np.diff(V)))


def build_carnot_cycle(
    T_hot=650.0,
    T_cold=450.0,
    V1_L=10.0,
    iso_ratio=1.70,
    gamma=1.40,
    n=1.00,
    points_per_process=160,
):
    """Reversible ideal-gas Carnot cycle."""
    if not (T_hot > T_cold > 0):
        raise ValueError("Require T_H > T_C > 0.")
    if V1_L <= 0:
        raise ValueError("V1 must be positive.")
    if iso_ratio <= 1:
        raise ValueError("V2/V1 must be greater than 1.")
    if gamma <= 1:
        raise ValueError("gamma must be greater than 1.")
    if n <= 0:
        raise ValueError("n must be positive.")

    V1 = V1_L * 1e-3
    V2 = V1 * iso_ratio

    adiabatic_ratio = (T_hot / T_cold) ** (1.0 / (gamma - 1.0))

    # Extremely large adiabatic volume ratios are mathematically valid
    # but make a compact educational visualization unusable.
    if adiabatic_ratio > 30:
        raise ValueError(
            f"Adiabatic V ratio = {adiabatic_ratio:.1f}, too large for this "
            "visualizer. Use closer temperatures or a larger gamma."
        )

    V3 = V2 * adiabatic_ratio
    V4 = V1 * adiabatic_ratio

    N = int(points_per_process)

    V12 = np.linspace(V1, V2, N, endpoint=False)
    T12 = np.full(N, T_hot)

    V23 = np.linspace(V2, V3, N, endpoint=False)
    T23 = T_hot * (V2 / V23) ** (gamma - 1.0)

    V34 = np.linspace(V3, V4, N, endpoint=False)
    T34 = np.full(N, T_cold)

    V41 = np.linspace(V4, V1, N)
    T41 = T_cold * (V4 / V41) ** (gamma - 1.0)

    V = np.concatenate((V12, V23, V34, V41))
    T = np.concatenate((T12, T23, T34, T41))
    P = n * R * T / V

    dS = n * R * math.log(iso_ratio)
    S = np.concatenate((
        n * R * np.log(V12 / V1),
        np.full(N, dS),
        dS + n * R * np.log(V34 / V3),
        np.zeros(N),
    ))

    stage = np.concatenate((
        np.zeros(N, dtype=int),
        np.ones(N, dtype=int),
        np.full(N, 2, dtype=int),
        np.full(N, 3, dtype=int),
    ))

    Q_H = n * R * T_hot * math.log(iso_ratio)
    Q_C_mag = n * R * T_cold * math.log(iso_ratio)
    # DeHoff convention: a heat-engine cycle has W_net < 0 because
    # the system delivers net work to the surroundings.
    W_net = -(Q_H - Q_C_mag)
    eta = -W_net / Q_H
    W_numeric = integrate_work_dehoff(P, V)

    states = [
        (V1, n * R * T_hot / V1, T_hot, 0.0),
        (V2, n * R * T_hot / V2, T_hot, dS),
        (V3, n * R * T_cold / V3, T_cold, dS),
        (V4, n * R * T_cold / V4, T_cold, 0.0),
    ]

    return {
        "V": V, "P": P, "T": T, "S": S, "stage": stage,
        "states": states,
        "state_indices": [0, N, 2*N, 3*N],
        "T_hot": float(T_hot),
        "T_cold": float(T_cold),
        "V1_L": float(V1_L),
        "iso_ratio": float(iso_ratio),
        "gamma": float(gamma),
        "n": float(n),
        "adiabatic_ratio": float(adiabatic_ratio),
        "dS": float(dS),
        "Q_H": float(Q_H),
        "Q_C_mag": float(Q_C_mag),
        "W_net": float(W_net),
        "W_numeric": float(W_numeric),
        "eta": float(eta),
        "names": [
            "1 → 2  Isothermal expansion",
            "2 → 3  Reversible adiabatic expansion",
            "3 → 4  Isothermal compression",
            "4 → 1  Reversible adiabatic compression",
        ],
        "descriptions": [
            "Heat enters from the hot reservoir; temperature stays constant.",
            "Insulated boundary: Q = 0 and expansion lowers temperature.",
            "Heat leaves to the cold reservoir; temperature stays constant.",
            "Insulated boundary: Q = 0 and compression raises temperature.",
        ],
    }


def _simulate_closed_engine_section(
    crank_deg,
    V,
    i_start,
    i_end,
    n_trapped,
    T_start,
    gamma,
    Q_release,
    burn_fraction,
):
    """
    Closed compression/combustion/expansion.

    Adiabatic step:
        T_new = T_old (V_old/V_new)^(gamma-1)

    Heat addition:
        Delta T = Delta Q / (n Cv)
    """
    Cv = R / (gamma - 1.0)

    T = np.full_like(crank_deg, np.nan, dtype=float)
    P = np.full_like(crank_deg, np.nan, dtype=float)

    T[i_start] = T_start
    P[i_start] = n_trapped * R * T_start / V[i_start]

    for j in range(i_start + 1, i_end + 1):
        T_ad = T[j - 1] * (V[j - 1] / V[j]) ** (gamma - 1.0)
        dQ = Q_release * (burn_fraction[j] - burn_fraction[j - 1])
        T[j] = T_ad + dQ / (n_trapped * Cv)
        P[j] = n_trapped * R * T[j] / V[j]

    return T, P


def build_four_stroke_engine(
    compression_ratio=9.5,
    T_intake=300.0,
    T_peak=2300.0,
    gamma=1.35,
    displacement_cc=500.0,
    rpm=1800.0,
    burn_duration_deg=60.0,
    P_atm=101325.0,
):
    """
    One-zone educational four-stroke spark-ignition engine.

    0-180°   intake
    180-360° compression
    ~350° onward finite-duration combustion
    360-540° power/expansion
    540-720° exhaust
    """
    if compression_ratio <= 1:
        raise ValueError("Compression ratio must exceed 1.")
    if not (T_peak > T_intake > 0):
        raise ValueError("Require T_peak > T_intake > 0.")
    if gamma <= 1:
        raise ValueError("gamma must exceed 1.")
    if displacement_cc <= 0:
        raise ValueError("Displacement must be positive.")
    if rpm <= 0:
        raise ValueError("RPM must be positive.")
    if not (20 <= burn_duration_deg <= 100):
        raise ValueError("Burn duration must be between 20° and 100°.")

    crank_deg = np.arange(0.0, 721.0, 1.0)
    theta = np.deg2rad(np.mod(crank_deg, 360.0))

    crank_r = 1.0
    rod_l = 3.5
    x = slider_crank_displacement(theta, crank_r, rod_l)
    x_norm = x / np.max(x)

    swept = displacement_cc * 1e-6
    V_clear = swept / (compression_ratio - 1.0)
    V = V_clear + swept * x_norm
    Vmin = float(np.min(V))
    Vmax = float(np.max(V))

    P_intake = 0.96 * P_atm
    P_exhaust = 1.05 * P_atm

    n_trapped = P_intake * Vmax / (R * T_intake)

    T2_ad = T_intake * compression_ratio ** (gamma - 1.0)
    if T_peak <= 1.05 * T2_ad:
        raise ValueError(
            f"Peak T must exceed compressed-gas temperature ({T2_ad:.0f} K)."
        )

    burn_start = 350.0
    burn_fraction = wiebe_fraction(
        crank_deg,
        start_deg=burn_start,
        duration_deg=burn_duration_deg,
    )

    # Solve total heat release so simulated max T reaches requested T_peak.
    Cv = R / (gamma - 1.0)
    q_lo = 0.0
    q_hi = n_trapped * Cv * (T_peak - T_intake) * 5.0

    for _ in range(60):
        q_mid = 0.5 * (q_lo + q_hi)

        T_closed, P_closed = _simulate_closed_engine_section(
            crank_deg,
            V,
            180,
            540,
            n_trapped,
            T_intake,
            gamma,
            q_mid,
            burn_fraction,
        )

        if np.nanmax(T_closed) < T_peak:
            q_lo = q_mid
        else:
            q_hi = q_mid

    Q_release = 0.5 * (q_lo + q_hi)

    T_closed, P_closed = _simulate_closed_engine_section(
        crank_deg,
        V,
        180,
        540,
        n_trapped,
        T_intake,
        gamma,
        Q_release,
        burn_fraction,
    )

    P = np.empty_like(crank_deg, dtype=float)
    T = np.empty_like(crank_deg, dtype=float)
    n_gas = np.empty_like(crank_deg, dtype=float)
    stage = np.empty_like(crank_deg, dtype=int)

    intake = crank_deg < 180
    closed = (crank_deg >= 180) & (crank_deg <= 540)
    exhaust = crank_deg > 540

    # Intake
    P[intake] = P_intake
    T[intake] = T_intake
    n_gas[intake] = P[intake] * V[intake] / (R * T[intake])
    stage[intake] = 0

    # Closed charge
    P[closed] = P_closed[closed]
    T[closed] = T_closed[closed]
    n_gas[closed] = n_trapped
    stage[(crank_deg >= 180) & (crank_deg < 360)] = 1
    stage[(crank_deg >= 360) & (crank_deg <= 540)] = 2

    # Exhaust / blowdown approximation
    P540 = P[540]
    T540 = T[540]
    T_blow = T540 * (P_exhaust / P540) ** ((gamma - 1.0) / gamma)
    T_end_exhaust = max(T_intake + 220.0, 520.0)

    frac = (crank_deg[exhaust] - 540.0) / 180.0
    T[exhaust] = T_blow + (T_end_exhaust - T_blow) * frac
    P[exhaust] = P_exhaust
    n_gas[exhaust] = P[exhaust] * V[exhaust] / (R * T[exhaust])
    stage[exhaust] = 3

    # DeHoff convention: a power-producing engine has W_ind < 0.
    W_ind = integrate_work_dehoff(P, V)
    eta_ind = -W_ind / Q_release

    eta_otto = 1.0 - 1.0 / compression_ratio ** (gamma - 1.0)
    eta_carnot_benchmark = 1.0 - T_intake / T_peak
    indicated_power = -W_ind * rpm / 120.0

    closed_mask = (crank_deg >= 180) & (crank_deg <= 540)
    W_closed = integrate_work_dehoff(P[closed_mask], V[closed_mask])
    # Pumping loop is positive in DeHoff convention: surroundings do
    # net work on the gas because exhaust pressure exceeds intake pressure.
    W_pumping = (P_exhaust - P_intake) * swept

    return {
        "crank_deg": crank_deg,
        "V": V,
        "P": P,
        "T": T,
        "n_gas": n_gas,
        "stage": stage,
        "burn_fraction": burn_fraction,
        "burn_start": float(burn_start),
        "burn_end": float(burn_start + burn_duration_deg),
        "compression_ratio": float(compression_ratio),
        "T_intake": float(T_intake),
        "T_peak": float(T_peak),
        "gamma": float(gamma),
        "displacement_cc": float(displacement_cc),
        "rpm": float(rpm),
        "burn_duration_deg": float(burn_duration_deg),
        "P_intake": float(P_intake),
        "P_exhaust": float(P_exhaust),
        "n_trapped": float(n_trapped),
        "Vmin": Vmin,
        "Vmax": Vmax,
        "Q_release": float(Q_release),
        "W_indicated": float(W_ind),
        "W_closed": float(W_closed),
        "W_pumping": float(W_pumping),
        "eta_indicated": float(eta_ind),
        "eta_otto_ideal": float(eta_otto),
        "eta_carnot_benchmark": float(eta_carnot_benchmark),
        "indicated_power": float(indicated_power),
        "names": [
            "1. Intake stroke",
            "2. Compression stroke",
            "3. Power stroke",
            "4. Exhaust stroke",
        ],
        "descriptions": [
            "Intake valve open: fresh charge enters as cylinder volume increases.",
            "Valves closed: the trapped charge is compressed.",
            "Finite-duration combustion and expansion produce indicated work.",
            "Exhaust valve open: blowdown is followed by expulsion of products.",
        ],
    }


# ============================================================
# SELF-TESTS
# ============================================================

def physics_self_test(verbose=True):
    checks = []

    def check(name, condition, detail=""):
        ok = bool(condition)
        checks.append((name, ok, detail))
        if verbose:
            print(
                f"[{'PASS' if ok else 'FAIL'}] {name}"
                + (f" — {detail}" if detail else "")
            )

    c = build_carnot_cycle()
    N = len(c["V"]) // 4

    check(
        "Carnot efficiency identity",
        abs(c["eta"] - (1 - c["T_cold"] / c["T_hot"])) < 1e-12,
    )
    check(
        "Carnot energy balance",
        abs(c["W_net"] + (c["Q_H"] - c["Q_C_mag"])) < 1e-10,
    )

    rel_work = abs(c["W_numeric"] - c["W_net"]) / abs(c["W_net"])
    check(
        "Carnot numerical P-V work uses DeHoff sign",
        rel_work < 3e-3,
        f"relative error={rel_work:.3e}",
    )

    check("Hot isotherm constant T", np.ptp(c["T"][:N]) < 1e-10)
    check("Cold isotherm constant T", np.ptp(c["T"][2*N:3*N]) < 1e-10)

    inv23 = c["P"][N:2*N] * c["V"][N:2*N] ** c["gamma"]
    inv41 = c["P"][3*N:] * c["V"][3*N:] ** c["gamma"]

    check(
        "Carnot 2->3 adiabatic invariant",
        np.std(inv23) / np.mean(inv23) < 1e-12,
    )
    check(
        "Carnot 4->1 adiabatic invariant",
        np.std(inv41) / np.mean(inv41) < 1e-12,
    )
    check(
        "Carnot Q_H = T_H ΔS",
        abs(c["Q_H"] - c["T_hot"] * c["dS"]) < 1e-10,
    )
    check(
        "Carnot |Q_C| = T_C ΔS",
        abs(c["Q_C_mag"] - c["T_cold"] * c["dS"]) < 1e-10,
    )

    e = build_four_stroke_engine()

    rc = e["Vmax"] / e["Vmin"]
    check(
        "Engine compression ratio",
        abs(rc - e["compression_ratio"]) / e["compression_ratio"] < 1e-12,
    )
    check(
        "Engine target peak T",
        abs(np.max(e["T"]) - e["T_peak"]) < 1.0,
    )

    closed_n = e["n_gas"][180:541]
    check(
        "Closed-stroke gas amount constant",
        np.ptp(closed_n) / np.mean(closed_n) < 1e-12,
    )

    inv_comp = e["P"][180:350] * e["V"][180:350] ** e["gamma"]
    check(
        "Pre-ignition compression adiabatic",
        np.std(inv_comp) / np.mean(inv_comp) < 2e-12,
    )

    i_after = int(math.ceil(e["burn_end"])) + 1
    inv_exp = e["P"][i_after:541] * e["V"][i_after:541] ** e["gamma"]
    check(
        "Post-burn expansion adiabatic",
        np.std(inv_exp) / np.mean(inv_exp) < 5e-12,
    )

    check(
        "Indicated work equals -integral(P dV)",
        abs(integrate_work_dehoff(e["P"], e["V"]) - e["W_indicated"]) < 1e-9,
    )

    decomp_error = abs(
        e["W_indicated"] - (e["W_closed"] + e["W_pumping"])
    ) / abs(e["W_indicated"])

    check(
        "DeHoff work decomposition: closed + pumping",
        decomp_error < 5e-3,
        f"relative error={decomp_error:.3e}",
    )

    check(
        "Indicated efficiency bounded",
        0 < e["eta_indicated"] < 1,
    )
    check(
        "Finite-burn efficiency below ideal Otto reference",
        e["eta_indicated"] < e["eta_otto_ideal"],
    )
    check(
        "Four-stroke cycle frequency",
        abs(
            e["indicated_power"]
            + e["W_indicated"] * e["rpm"] / 120.0
        ) < 1e-10,
    )

    rng = np.random.default_rng(4)
    sweep_ok = True

    for _ in range(25):
        eng = build_four_stroke_engine(
            compression_ratio=rng.uniform(7, 13),
            T_intake=rng.uniform(285, 330),
            T_peak=rng.uniform(1900, 2700),
            gamma=rng.uniform(1.28, 1.40),
            displacement_cc=rng.uniform(300, 850),
            rpm=rng.uniform(900, 4200),
            burn_duration_deg=rng.uniform(35, 85),
        )

        if not (
            np.all(np.isfinite(eng["P"]))
            and np.all(np.isfinite(eng["T"]))
            and np.all(np.isfinite(eng["V"]))
            and 0 < eng["eta_indicated"] < 1
            and eng["W_indicated"] < 0
        ):
            sweep_ok = False
            break

    check("Randomized engine parameter sweep", sweep_ok)

    passed = sum(ok for _, ok, _ in checks)

    if verbose:
        print(f"\nPhysics self-test: {passed}/{len(checks)} checks passed.")

    return passed == len(checks), checks


# ============================================================
# STATIC CANVAS DRAWING HELPERS
# ============================================================

class VisualState:
    """Stores dynamic artists for either mode."""

    def __init__(self):
        pass


def _add_cycle_arrows(ax, x, y, boundaries):
    bounds = list(boundaries) + [len(x)]

    for s in range(len(boundaries)):
        start = bounds[s]
        end = bounds[s + 1]
        length = end - start

        if length < 10:
            continue

        i0 = start + int(0.40 * length)
        i1 = min(start + int(0.50 * length), end - 1)

        ax.annotate(
            "",
            xy=(x[i1], y[i1]),
            xytext=(x[i0], y[i0]),
            arrowprops=dict(arrowstyle="->", lw=1.3),
        )


def create_main_figure():
    """
    Figure contains only scientific content.
    All GUI controls live outside the Matplotlib canvas.
    """
    fig = Figure(figsize=(10.8, 7.5), constrained_layout=True)

    gs = fig.add_gridspec(
        2, 2,
        width_ratios=[0.92, 1.45],
        height_ratios=[1, 1],
    )

    ax_engine = fig.add_subplot(gs[:, 0])
    ax_plot1 = fig.add_subplot(gs[0, 1])
    ax_plot2 = fig.add_subplot(gs[1, 1])

    return fig, ax_engine, ax_plot1, ax_plot2


def setup_carnot_artists(fig, ax_engine, ax_plot1, ax_plot2, data, rng):
    state = VisualState()
    state.mode = "Carnot"
    state.data = data
    state.rng = rng

    fig.suptitle("Carnot heat engine", fontsize=15, weight="bold")

    # ---------------- Piston view ----------------
    ax = ax_engine
    ax.clear()
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 10)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_title("Piston and working gas", fontsize=11)

    state.cx0, state.cx1 = 2.4, 7.2
    state.cy0, state.cy1 = 2.8, 8.0

    state.wall, = ax.plot(
        [
            state.cx0, state.cx0, np.nan,
            state.cx1, state.cx1, np.nan,
            state.cx0, state.cx1
        ],
        [
            state.cy0, state.cy1, np.nan,
            state.cy0, state.cy1, np.nan,
            state.cy0, state.cy0
        ],
        lw=2.6,
    )
    mech = state.wall.get_color()

    def piston_y(volume):
        vmin = float(np.min(data["V"]))
        vmax = float(np.max(data["V"]))
        frac = (volume - vmin) / max(vmax - vmin, 1e-15)
        return 4.25 + 2.70 * frac

    state.piston_y_fn = piston_y
    y0 = piston_y(data["V"][0])

    state.gas = Rectangle(
        (state.cx0, state.cy0),
        state.cx1 - state.cx0,
        y0 - state.cy0,
        alpha=0.18,
    )
    ax.add_patch(state.gas)

    state.piston = Rectangle(
        (state.cx0 - 0.08, y0 - 0.10),
        state.cx1 - state.cx0 + 0.16,
        0.20,
        facecolor="none",
        edgecolor=mech,
        lw=2.2,
    )
    ax.add_patch(state.piston)

    state.rod, = ax.plot(
        [4.8, 4.8],
        [y0 + 0.10, 8.75],
        lw=3.5,
        color=mech,
    )

    load = Rectangle(
        (4.32, 8.72),
        0.96,
        0.40,
        facecolor="none",
        edgecolor=mech,
        lw=1.8,
    )
    ax.add_patch(load)
    ax.text(4.8, 8.92, "load", ha="center", va="center", fontsize=8)

    state.particle_xy = rng.random((42, 2))
    vel = rng.normal(size=(42, 2))
    vel /= np.linalg.norm(vel, axis=1, keepdims=True)
    state.particle_vel = vel
    state.particles = ax.scatter([], [], s=16)

    state.boundary = Rectangle(
        (2.15, 1.78),
        5.3,
        0.50,
        alpha=0.12,
    )
    ax.add_patch(state.boundary)

    state.boundary_text = ax.text(
        4.8, 2.03, "",
        ha="center",
        va="center",
        fontsize=9,
        weight="bold",
    )

    state.heat_arrow = FancyArrowPatch(
        (4.8, 2.35),
        (4.8, 3.12),
        arrowstyle="-|>",
        mutation_scale=16,
        lw=1.8,
    )
    ax.add_patch(state.heat_arrow)

    state.work_arrow = FancyArrowPatch(
        (7.78, 5.0),
        (7.78, 6.0),
        arrowstyle="-|>",
        mutation_scale=16,
        lw=1.8,
    )
    ax.add_patch(state.work_arrow)

    state.work_text = ax.text(
        8.0, 5.5, "",
        ha="left",
        va="center",
        fontsize=8.2,
    )

    state.state_text = ax.text(
        0.25, 9.15, "",
        ha="left",
        va="top",
        fontsize=8.8,
        bbox=dict(boxstyle="round,pad=0.30", alpha=0.06),
    )

    state.stage_text = ax.text(
        0.25, 1.15, "",
        ha="left",
        va="top",
        fontsize=10.0,
        weight="bold",
    )

    state.desc_text = ax.text(
        0.25, 0.72, "",
        ha="left",
        va="top",
        fontsize=8.1,
    )

    # ---------------- P-V ----------------
    ax_plot1.clear()
    V_L = data["V"] * 1e3
    P_kPa = data["P"] / 1e3

    for stage_id in range(4):
        mask = data["stage"] == stage_id
        ax_plot1.plot(V_L[mask], P_kPa[mask], lw=2.0)

    ax_plot1.fill(V_L, P_kPa, alpha=0.06)
    state.pv_dot, = ax_plot1.plot([V_L[0]], [P_kPa[0]], "o", ms=7)

    for label, st in enumerate(data["states"], start=1):
        Vst, Pst, _, _ = st
        ax_plot1.annotate(
            str(label),
            (Vst * 1e3, Pst / 1e3),
            xytext=(5, 5),
            textcoords="offset points",
            weight="bold",
            fontsize=9,
        )

    _add_cycle_arrows(
        ax_plot1,
        V_L,
        P_kPa,
        data["state_indices"],
    )

    ax_plot1.set_title("P–V cycle  (clockwise area = -W)", fontsize=10.5)
    ax_plot1.set_xlabel("Volume (L)")
    ax_plot1.set_ylabel("Pressure (kPa)")
    ax_plot1.grid(alpha=0.20)

    # ---------------- T-S ----------------
    ax_plot2.clear()

    for stage_id in range(4):
        mask = data["stage"] == stage_id
        ax_plot2.plot(data["S"][mask], data["T"][mask], lw=2.0)

    ax_plot2.fill(data["S"], data["T"], alpha=0.06)
    state.ts_dot, = ax_plot2.plot(
        [data["S"][0]], [data["T"][0]], "o", ms=7
    )

    for label, st in enumerate(data["states"], start=1):
        _, _, Tst, Sst = st
        ax_plot2.annotate(
            str(label),
            (Sst, Tst),
            xytext=(5, 5),
            textcoords="offset points",
            weight="bold",
            fontsize=9,
        )

    _add_cycle_arrows(
        ax_plot2,
        data["S"],
        data["T"],
        data["state_indices"],
    )

    ax_plot2.set_title(r"T–S cycle: $\delta Q_{rev}=T\,dS$", fontsize=10.5)
    ax_plot2.set_xlabel("Entropy relative to state 1 (J/K)")
    ax_plot2.set_ylabel("Temperature (K)")
    ax_plot2.grid(alpha=0.20)

    return state


def setup_engine_artists(fig, ax_engine, ax_plot1, ax_plot2, data, rng):
    state = VisualState()
    state.mode = "Engine"
    state.data = data
    state.rng = rng

    fig.suptitle("Four-stroke spark-ignition engine", fontsize=15, weight="bold")

    ax = ax_engine
    ax.clear()
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 10)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_title("Mechanism and one-zone gas state", fontsize=11)

    state.crank_center = np.array([5.0, 2.75])
    state.crank_radius = 0.78
    state.rod_length = 3.5 * state.crank_radius
    state.piston_half_height = 0.20

    def geometry(crank_deg):
        theta = math.radians(crank_deg % 360.0)
        cx, cy = state.crank_center
        r = state.crank_radius
        l = state.rod_length

        crank_x = cx + r * math.sin(theta)
        crank_y = cy + r * math.cos(theta)

        horizontal = crank_x - cx
        vertical_rod = math.sqrt(max(l*l - horizontal*horizontal, 0.0))
        piston_pin_y = crank_y + vertical_rod

        return piston_pin_y, np.array([crank_x, crank_y])

    state.geometry_fn = geometry

    pin_tdc, _ = geometry(0)
    pin_bdc, _ = geometry(180)

    top_tdc = pin_tdc + state.piston_half_height
    top_bdc = pin_bdc + state.piston_half_height

    stroke = top_tdc - top_bdc
    clearance = stroke / (data["compression_ratio"] - 1.0)

    state.head_y = top_tdc + clearance
    state.cyl_bottom = top_bdc - 0.28
    state.ex0, state.ex1 = 3.15, 6.85

    state.wall, = ax.plot(
        [
            state.ex0, state.ex0, np.nan,
            state.ex1, state.ex1, np.nan,
            state.ex0, state.ex1
        ],
        [
            state.cyl_bottom, state.head_y, np.nan,
            state.cyl_bottom, state.head_y, np.nan,
            state.head_y, state.head_y
        ],
        lw=2.6,
    )
    mech = state.wall.get_color()

    port_y = state.head_y - 0.17
    state.port_y = port_y

    ax.plot([2.25, state.ex0], [port_y, port_y], lw=2.6, color=mech)
    ax.plot([state.ex1, 7.75], [port_y, port_y], lw=2.6, color=mech)

    ax.text(2.15, port_y, "INTAKE", ha="right", va="center", fontsize=8)
    ax.text(7.85, port_y, "EXHAUST", ha="left", va="center", fontsize=8)

    state.intake_valve, = ax.plot(
        [3.80, 3.80],
        [state.head_y + 0.02, state.head_y - 0.32],
        lw=3.6,
        color=mech,
    )
    state.exhaust_valve, = ax.plot(
        [6.20, 6.20],
        [state.head_y + 0.02, state.head_y - 0.32],
        lw=3.6,
        color=mech,
    )

    ax.plot(
        [5.0, 5.0],
        [state.head_y + 0.48, state.head_y + 0.03],
        lw=2.4,
        color=mech,
    )
    ax.text(
        5.0,
        state.head_y + 0.57,
        "spark plug",
        ha="center",
        va="bottom",
        fontsize=7.8,
    )

    state.spark, = ax.plot(
        [5.0],
        [state.head_y - 0.10],
        marker="*",
        ms=15,
        linestyle="None",
    )
    state.spark.set_visible(False)

    ax.add_patch(
        Circle(
            tuple(state.crank_center),
            state.crank_radius,
            fill=False,
            lw=1.8,
            edgecolor=mech,
        )
    )

    pin_y, crank_pin = geometry(0)

    state.crank_pin = Circle(
        tuple(crank_pin),
        0.085,
        fill=False,
        lw=1.8,
        edgecolor=mech,
    )
    ax.add_patch(state.crank_pin)

    state.piston = Rectangle(
        (3.48, pin_y - state.piston_half_height),
        3.04,
        2 * state.piston_half_height,
        fill=False,
        lw=2.2,
        edgecolor=mech,
    )
    ax.add_patch(state.piston)

    state.conrod, = ax.plot(
        [5.0, crank_pin[0]],
        [pin_y, crank_pin[1]],
        lw=3.6,
        color=mech,
    )

    piston_top = pin_y + state.piston_half_height

    state.gas = Rectangle(
        (state.ex0, piston_top),
        state.ex1 - state.ex0,
        max(state.head_y - piston_top, 0.02),
        alpha=0.18,
    )
    ax.add_patch(state.gas)

    state.particle_xy = rng.random((38, 2))
    vel = rng.normal(size=(38, 2))
    vel /= np.linalg.norm(vel, axis=1, keepdims=True)
    state.particle_vel = vel
    state.particles = ax.scatter([], [], s=16)

    state.intake_arrow = FancyArrowPatch(
        (2.30, port_y),
        (3.08, port_y),
        arrowstyle="-|>",
        mutation_scale=15,
        lw=1.7,
    )
    state.exhaust_arrow = FancyArrowPatch(
        (6.92, port_y),
        (7.70, port_y),
        arrowstyle="-|>",
        mutation_scale=15,
        lw=1.7,
    )
    ax.add_patch(state.intake_arrow)
    ax.add_patch(state.exhaust_arrow)

    state.state_text = ax.text(
        0.25, 9.10, "",
        ha="left",
        va="top",
        fontsize=8.6,
        bbox=dict(boxstyle="round,pad=0.30", alpha=0.06),
    )

    state.stage_text = ax.text(
        0.25, 1.15, "",
        ha="left",
        va="top",
        fontsize=10.0,
        weight="bold",
    )

    state.desc_text = ax.text(
        0.25, 0.72, "",
        ha="left",
        va="top",
        fontsize=8.0,
    )

    # P-V
    ax_plot1.clear()
    Vcc = data["V"] * 1e6
    Pbar = data["P"] / 1e5

    # Draw stage segments separately so the process order is easier to read.
    for stage_id in range(4):
        mask = data["stage"] == stage_id
        ax_plot1.plot(Vcc[mask], Pbar[mask], lw=2.0)

    # Add blowdown connector explicitly.
    ax_plot1.plot(
        [Vcc[540], Vcc[541]],
        [Pbar[540], Pbar[541]],
        lw=1.6,
    )

    ax_plot1.fill(Vcc, Pbar, alpha=0.06)
    state.pv_dot, = ax_plot1.plot([Vcc[0]], [Pbar[0]], "o", ms=7)

    ax_plot1.set_title("Indicated P–V loop  (area = -W_ind)", fontsize=10.5)
    ax_plot1.set_xlabel("Cylinder volume (cm³)")
    ax_plot1.set_ylabel("Pressure (bar)")
    ax_plot1.grid(alpha=0.20)

    # Pressure vs angle
    ax_plot2.clear()

    ax_plot2.plot(data["crank_deg"], Pbar, lw=2.0)
    state.ca_dot, = ax_plot2.plot([0], [Pbar[0]], "o", ms=7)

    for x in (180, 360, 540):
        ax_plot2.axvline(x, ls="--", alpha=0.35)

    ax_plot2.axvline(data["burn_start"], ls=":", alpha=0.45)
    ax_plot2.axvline(data["burn_end"], ls=":", alpha=0.45)

    for x, label in (
        (90, "intake"),
        (270, "compression"),
        (450, "power"),
        (630, "exhaust"),
    ):
        ax_plot2.text(
            x,
            0.96,
            label,
            transform=ax_plot2.get_xaxis_transform(),
            ha="center",
            va="top",
            fontsize=8,
        )

    ax_plot2.set_xlim(0, 720)
    ax_plot2.set_title("Cylinder pressure vs crank angle", fontsize=10.5)
    ax_plot2.set_xlabel("Crank angle (degrees)")
    ax_plot2.set_ylabel("Pressure (bar)")
    ax_plot2.grid(alpha=0.20)

    return state


def move_particles(state, T, bounds, speed_factor=1.0, visible_fraction=1.0):
    step = 0.008 * math.sqrt(max(T, 1.0) / 600.0) * speed_factor

    state.particle_xy += state.particle_vel * step

    for dim in (0, 1):
        lo = state.particle_xy[:, dim] < 0
        hi = state.particle_xy[:, dim] > 1

        state.particle_xy[lo, dim] *= -1
        state.particle_vel[lo, dim] *= -1

        state.particle_xy[hi, dim] = 2 - state.particle_xy[hi, dim]
        state.particle_vel[hi, dim] *= -1

    x0, x1, y0, y1 = bounds

    xs = x0 + state.particle_xy[:, 0] * max(x1 - x0, 0.02)
    ys = y0 + state.particle_xy[:, 1] * max(y1 - y0, 0.02)

    count = max(
        1,
        min(
            len(xs),
            int(round(np.clip(visible_fraction, 0, 1) * len(xs))),
        ),
    )

    state.particles.set_offsets(np.column_stack((xs[:count], ys[:count])))


def update_carnot_artists(state, i, speed=1.0):
    d = state.data
    i %= len(d["V"])

    V = d["V"][i]
    P = d["P"][i]
    T = d["T"][i]
    S = d["S"][i]
    st = int(d["stage"][i])

    py = state.piston_y_fn(V)

    state.piston.set_y(py - 0.10)
    state.rod.set_ydata([py + 0.10, 8.72])
    state.gas.set_height(py - state.cy0)

    temp_fraction = np.clip(
        (T - d["T_cold"]) / (d["T_hot"] - d["T_cold"]),
        0,
        1,
    )
    state.gas.set_facecolor(plt.get_cmap("coolwarm")(temp_fraction))

    move_particles(
        state,
        T,
        (
            state.cx0 + 0.14,
            state.cx1 - 0.14,
            state.cy0 + 0.14,
            py - 0.16,
        ),
        speed_factor=speed,
    )

    state.pv_dot.set_data([V * 1e3], [P / 1e3])
    state.ts_dot.set_data([S], [T])

    state.state_text.set_text(
        f"T = {T:.0f} K\n"
        f"P = {P/1e3:.1f} kPa\n"
        f"V = {V*1e3:.2f} L\n"
        f"S = {S:.3f} J/K"
    )

    state.stage_text.set_text(d["names"][st])
    state.desc_text.set_text(d["descriptions"][st])

    if st == 0:
        state.boundary_text.set_text(
            f"HOT RESERVOIR   T_H = {d['T_hot']:.0f} K"
        )
        state.boundary.set_hatch("")
        state.heat_arrow.set_positions((4.8, 2.35), (4.8, 3.12))
        state.heat_arrow.set_visible(True)
        state.work_arrow.set_positions((7.78, 5.0), (7.78, 6.0))
        state.work_text.set_text("expansion\nW < 0")

    elif st == 1:
        state.boundary_text.set_text("ADIABATIC / INSULATED")
        state.boundary.set_hatch("////")
        state.heat_arrow.set_visible(False)
        state.work_arrow.set_positions((7.78, 5.0), (7.78, 6.0))
        state.work_text.set_text("Q = 0\nW < 0")

    elif st == 2:
        state.boundary_text.set_text(
            f"COLD RESERVOIR   T_C = {d['T_cold']:.0f} K"
        )
        state.boundary.set_hatch("")
        state.heat_arrow.set_positions((4.8, 3.12), (4.8, 2.35))
        state.heat_arrow.set_visible(True)
        state.work_arrow.set_positions((7.78, 6.0), (7.78, 5.0))
        state.work_text.set_text("compression\nW > 0")

    else:
        state.boundary_text.set_text("ADIABATIC / INSULATED")
        state.boundary.set_hatch("////")
        state.heat_arrow.set_visible(False)
        state.work_arrow.set_positions((7.78, 6.0), (7.78, 5.0))
        state.work_text.set_text("Q = 0\nW > 0")


def update_engine_artists(state, i, speed=1.0):
    d = state.data
    i %= len(d["crank_deg"])

    angle = d["crank_deg"][i]
    V = d["V"][i]
    P = d["P"][i]
    T = d["T"][i]
    n_now = d["n_gas"][i]
    st = int(d["stage"][i])

    pin_y, crank_pin = state.geometry_fn(angle)
    piston_top = pin_y + state.piston_half_height

    state.piston.set_y(pin_y - state.piston_half_height)
    state.crank_pin.center = tuple(crank_pin)
    state.conrod.set_data(
        [5.0, crank_pin[0]],
        [pin_y, crank_pin[1]],
    )

    state.gas.set_y(piston_top)
    state.gas.set_height(max(state.head_y - piston_top, 0.02))

    temp_fraction = np.clip(
        (T - d["T_intake"]) / (d["T_peak"] - d["T_intake"]),
        0,
        1,
    )
    state.gas.set_facecolor(plt.get_cmap("coolwarm")(temp_fraction))

    visible_fraction = min(
        1.0,
        n_now / max(d["n_trapped"], 1e-15),
    )

    move_particles(
        state,
        T,
        (
            state.ex0 + 0.13,
            state.ex1 - 0.13,
            piston_top + 0.07,
            state.head_y - 0.11,
        ),
        speed_factor=speed,
        visible_fraction=visible_fraction,
    )

    intake_open = st == 0
    exhaust_open = st == 3

    valve_closed = state.head_y - 0.32
    valve_open = state.head_y - 0.47

    state.intake_valve.set_ydata(
        [state.head_y + 0.02, valve_open if intake_open else valve_closed]
    )
    state.exhaust_valve.set_ydata(
        [state.head_y + 0.02, valve_open if exhaust_open else valve_closed]
    )

    state.intake_arrow.set_visible(intake_open)
    state.exhaust_arrow.set_visible(exhaust_open)

    state.spark.set_visible(
        d["burn_start"] <= angle <= min(d["burn_start"] + 15, d["burn_end"])
    )

    state.pv_dot.set_data([V * 1e6], [P / 1e5])
    state.ca_dot.set_data([angle], [P / 1e5])

    state.state_text.set_text(
        f"θ = {angle:.0f}°\n"
        f"T = {T:.0f} K\n"
        f"P = {P/1e5:.2f} bar\n"
        f"V = {V*1e6:.0f} cm³\n"
        f"gas = {1e3*n_now:.1f} mmol"
    )

    state.stage_text.set_text(d["names"][st])
    state.desc_text.set_text(d["descriptions"][st])


# ============================================================
# RESPONSIVE TKINTER GUI
# ============================================================

def run_gui():
    try:
        import tkinter as tk
        from tkinter import ttk
        from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
    except Exception as exc:
        raise SystemExit(
            "The GUI requires tkinter and Matplotlib's Tk backend.\n"
            f"Import error: {exc}"
        )

    class ScrollableSidebar(ttk.Frame):
        def __init__(self, parent):
            super().__init__(parent)

            self.canvas = tk.Canvas(
                self,
                highlightthickness=0,
                borderwidth=0,
                width=290,
            )
            self.scrollbar = ttk.Scrollbar(
                self,
                orient="vertical",
                command=self.canvas.yview,
            )
            self.inner = ttk.Frame(self.canvas)

            self.window_id = self.canvas.create_window(
                (0, 0),
                window=self.inner,
                anchor="nw",
            )

            self.canvas.configure(yscrollcommand=self.scrollbar.set)

            self.canvas.grid(row=0, column=0, sticky="nsew")
            self.scrollbar.grid(row=0, column=1, sticky="ns")

            self.rowconfigure(0, weight=1)
            self.columnconfigure(0, weight=1)

            self.inner.bind("<Configure>", self._update_scroll_region)
            self.canvas.bind("<Configure>", self._resize_inner)

            # Mouse wheel works while pointer is over the sidebar.
            self.canvas.bind("<Enter>", self._bind_wheel)
            self.canvas.bind("<Leave>", self._unbind_wheel)

        def _update_scroll_region(self, _event=None):
            self.canvas.configure(scrollregion=self.canvas.bbox("all"))

        def _resize_inner(self, event):
            self.canvas.itemconfigure(self.window_id, width=event.width)

        def _bind_wheel(self, _event=None):
            self.canvas.bind_all("<MouseWheel>", self._on_mousewheel)
            self.canvas.bind_all("<Button-4>", self._on_linux_up)
            self.canvas.bind_all("<Button-5>", self._on_linux_down)

        def _unbind_wheel(self, _event=None):
            self.canvas.unbind_all("<MouseWheel>")
            self.canvas.unbind_all("<Button-4>")
            self.canvas.unbind_all("<Button-5>")

        def _on_mousewheel(self, event):
            # Windows uses multiples of 120, macOS often small deltas.
            delta = event.delta
            if abs(delta) >= 120:
                units = int(-delta / 120)
            else:
                units = -1 if delta > 0 else 1
            self.canvas.yview_scroll(units, "units")

        def _on_linux_up(self, _event):
            self.canvas.yview_scroll(-1, "units")

        def _on_linux_down(self, _event):
            self.canvas.yview_scroll(1, "units")

    class App:
        def __init__(self, root):
            self.root = root
            self.root.title("Thermodynamic Engine Visualizer v6")

            screen_w = root.winfo_screenwidth()
            screen_h = root.winfo_screenheight()

            # Fit comfortably on the user's actual display.
            win_w = min(1500, max(900, int(screen_w * 0.92)))
            win_h = min(900, max(620, int(screen_h * 0.86)))

            x = max(0, (screen_w - win_w) // 2)
            y = max(0, (screen_h - win_h) // 3)

            root.geometry(f"{win_w}x{win_h}+{x}+{y}")

            min_w = min(920, max(760, screen_w - 120))
            min_h = min(620, max(540, screen_h - 140))
            root.minsize(min_w, min_h)

            self.mode = "Carnot"
            self.running = True
            self.frame = 0.0
            self.speed = 1.0
            self.after_id = None
            self.rng = np.random.default_rng(8)

            self.carnot = build_carnot_cycle()
            self.engine = build_four_stroke_engine()

            self.root.columnconfigure(0, weight=1)
            self.root.rowconfigure(1, weight=1)

            # ---------------- Top bar ----------------
            topbar = ttk.Frame(root, padding=(12, 8))
            topbar.grid(row=0, column=0, sticky="ew")
            topbar.columnconfigure(0, weight=1)

            self.title_label = ttk.Label(
                topbar,
                text="Thermodynamic Engine Visualizer",
                font=("", 15, "bold"),
            )
            self.title_label.grid(row=0, column=0, sticky="w")

            ttk.Label(topbar, text="Mode:").grid(
                row=0, column=1, padx=(12, 6)
            )

            self.mode_var = tk.StringVar(value="Carnot")
            self.mode_combo = ttk.Combobox(
                topbar,
                textvariable=self.mode_var,
                state="readonly",
                width=20,
                values=("Carnot", "4-stroke engine"),
            )
            self.mode_combo.grid(row=0, column=2, sticky="e")
            self.mode_combo.bind("<<ComboboxSelected>>", self.on_mode_change)

            # ---------------- Main split ----------------
            self.paned = ttk.Panedwindow(root, orient="horizontal")
            self.paned.grid(row=1, column=0, sticky="nsew")

            self.sidebar = ScrollableSidebar(self.paned)
            self.visual_frame = ttk.Frame(self.paned)

            self.paned.add(self.sidebar, weight=0)
            self.paned.add(self.visual_frame, weight=1)

            self.visual_frame.rowconfigure(0, weight=1)
            self.visual_frame.columnconfigure(0, weight=1)

            # ---------------- Matplotlib canvas ----------------
            (
                self.fig,
                self.ax_engine,
                self.ax_plot1,
                self.ax_plot2,
            ) = create_main_figure()

            self.canvas = FigureCanvasTkAgg(
                self.fig,
                master=self.visual_frame,
            )
            self.canvas_widget = self.canvas.get_tk_widget()
            self.canvas_widget.grid(
                row=0,
                column=0,
                sticky="nsew",
                padx=(4, 8),
                pady=(2, 4),
            )

            # Status line is NOT inside the Matplotlib figure.
            self.status_var = tk.StringVar()
            self.status_label = ttk.Label(
                self.visual_frame,
                textvariable=self.status_var,
                anchor="center",
                justify="center",
            )
            self.status_label.grid(
                row=1,
                column=0,
                sticky="ew",
                padx=8,
                pady=(2, 6),
            )

            # ---------------- Sidebar controls ----------------
            self.control_container = ttk.Frame(
                self.sidebar.inner,
                padding=(12, 8),
            )
            self.control_container.pack(fill="both", expand=True)

            self.input_vars = {}
            self.input_entries = {}

            self.build_controls()

            self.setup_visualization()
            self.schedule_next_frame()

            # Clean timer on close.
            self.root.protocol("WM_DELETE_WINDOW", self.on_close)

        # --------------------------------------------------------
        # Sidebar construction
        # --------------------------------------------------------
        def clear_control_container(self):
            for child in self.control_container.winfo_children():
                child.destroy()

            self.input_vars = {}
            self.input_entries = {}

        def add_section_title(self, text):
            ttk.Label(
                self.control_container,
                text=text,
                font=("", 10, "bold"),
            ).pack(
                anchor="w",
                pady=(10, 6),
            )

        def add_input(self, key, label, value, unit=""):
            row = ttk.Frame(self.control_container)
            row.pack(fill="x", pady=4)

            row.columnconfigure(1, weight=1)

            ttk.Label(
                row,
                text=label,
                width=19,
                anchor="w",
            ).grid(row=0, column=0, sticky="w")

            var = tk.StringVar(value=str(value))
            entry = ttk.Entry(
                row,
                textvariable=var,
                width=11,
            )
            entry.grid(
                row=0,
                column=1,
                sticky="ew",
                padx=(5, 6),
            )

            ttk.Label(
                row,
                text=unit,
                width=7,
                anchor="w",
            ).grid(row=0, column=2, sticky="w")

            self.input_vars[key] = var
            self.input_entries[key] = entry

        def build_controls(self):
            self.clear_control_container()

            self.add_section_title("MODEL INPUTS")

            if self.mode == "Carnot":
                d = self.carnot

                self.add_input("T_hot", "Hot temperature", d["T_hot"], "K")
                self.add_input("T_cold", "Cold temperature", d["T_cold"], "K")
                self.add_input("V1_L", "Initial volume V1", d["V1_L"], "L")
                self.add_input(
                    "iso_ratio",
                    "Expansion ratio V2/V1",
                    d["iso_ratio"],
                    "",
                )
                self.add_input("gamma", "Heat-capacity ratio", d["gamma"], "")
                self.add_input("n", "Gas amount", d["n"], "mol")

            else:
                d = self.engine

                self.add_input(
                    "compression_ratio",
                    "Compression ratio",
                    d["compression_ratio"],
                    "",
                )
                self.add_input(
                    "T_intake",
                    "Intake temperature",
                    d["T_intake"],
                    "K",
                )
                self.add_input(
                    "T_peak",
                    "Target peak T",
                    d["T_peak"],
                    "K",
                )
                self.add_input("gamma", "Heat-capacity ratio", d["gamma"], "")
                self.add_input(
                    "displacement_cc",
                    "Displacement",
                    d["displacement_cc"],
                    "cc",
                )
                self.add_input("rpm", "Engine speed", d["rpm"], "rpm")
                self.add_input(
                    "burn_duration_deg",
                    "Combustion duration",
                    d["burn_duration_deg"],
                    "deg",
                )

            action_row = ttk.Frame(self.control_container)
            action_row.pack(fill="x", pady=(12, 4))
            action_row.columnconfigure((0, 1), weight=1)

            ttk.Button(
                action_row,
                text="Apply inputs",
                command=self.apply_inputs,
            ).grid(
                row=0,
                column=0,
                sticky="ew",
                padx=(0, 4),
            )

            ttk.Button(
                action_row,
                text="Defaults",
                command=self.restore_defaults,
            ).grid(
                row=0,
                column=1,
                sticky="ew",
                padx=(4, 0),
            )

            self.message_var = tk.StringVar(value="")
            self.message_label = ttk.Label(
                self.control_container,
                textvariable=self.message_var,
                wraplength=250,
                justify="left",
            )
            self.message_label.pack(
                fill="x",
                pady=(4, 8),
            )

            ttk.Separator(
                self.control_container,
                orient="horizontal",
            ).pack(fill="x", pady=8)

            self.add_section_title("ANIMATION")

            speed_row = ttk.Frame(self.control_container)
            speed_row.pack(fill="x", pady=(4, 8))
            speed_row.columnconfigure(1, weight=1)

            ttk.Label(
                speed_row,
                text="Speed",
                width=10,
            ).grid(row=0, column=0, sticky="w")

            self.speed_var = tk.DoubleVar(value=self.speed)

            self.speed_scale = ttk.Scale(
                speed_row,
                from_=0.25,
                to=4.0,
                variable=self.speed_var,
                command=self.on_speed_change,
            )
            self.speed_scale.grid(
                row=0,
                column=1,
                sticky="ew",
                padx=(5, 6),
            )

            self.speed_label = ttk.Label(
                speed_row,
                text=f"{self.speed:.2f}×",
                width=6,
            )
            self.speed_label.grid(row=0, column=2, sticky="e")

            anim_buttons = ttk.Frame(self.control_container)
            anim_buttons.pack(fill="x", pady=4)
            anim_buttons.columnconfigure((0, 1), weight=1)

            self.pause_button = ttk.Button(
                anim_buttons,
                text="Pause",
                command=self.toggle_pause,
            )
            self.pause_button.grid(
                row=0,
                column=0,
                sticky="ew",
                padx=(0, 4),
            )

            ttk.Button(
                anim_buttons,
                text="Restart cycle",
                command=self.restart_cycle,
            ).grid(
                row=0,
                column=1,
                sticky="ew",
                padx=(4, 0),
            )

            ttk.Separator(
                self.control_container,
                orient="horizontal",
            ).pack(fill="x", pady=10)

            self.add_section_title("MODEL SCOPE")

            scope = (
                "Carnot mode: reversible ideal-gas cycle.\n\n"
                if self.mode == "Carnot"
                else
                "Engine mode: one-zone educational model with slider-crank "
                "kinematics, finite-duration heat release, pumping, and blowdown. "
                "It is not CFD or detailed combustion chemistry."
            )

            ttk.Label(
                self.control_container,
                text=scope,
                wraplength=255,
                justify="left",
            ).pack(fill="x", pady=(0, 12))

        # --------------------------------------------------------
        # Input / mode actions
        # --------------------------------------------------------
        def parse_inputs(self):
            try:
                return {
                    key: float(var.get())
                    for key, var in self.input_vars.items()
                }
            except ValueError:
                raise ValueError("All input fields must contain numeric values.")

        def apply_inputs(self):
            try:
                values = self.parse_inputs()

                if self.mode == "Carnot":
                    self.carnot = build_carnot_cycle(**values)
                else:
                    self.engine = build_four_stroke_engine(**values)

                self.frame = 0.0
                self.message_var.set("Inputs applied.")
                self.setup_visualization()

            except ValueError as exc:
                self.message_var.set(f"Input error: {exc}")

        def restore_defaults(self):
            if self.mode == "Carnot":
                self.carnot = build_carnot_cycle()
            else:
                self.engine = build_four_stroke_engine()

            self.frame = 0.0
            self.message_var.set("Defaults restored.")
            self.build_controls()
            self.setup_visualization()

        def on_mode_change(self, _event=None):
            self.mode = (
                "Carnot"
                if self.mode_var.get() == "Carnot"
                else "Engine"
            )

            self.frame = 0.0
            self.build_controls()
            self.setup_visualization()

        def on_speed_change(self, _value=None):
            self.speed = float(self.speed_var.get())
            self.speed_label.configure(text=f"{self.speed:.2f}×")

        def toggle_pause(self):
            self.running = not self.running
            self.pause_button.configure(
                text="Pause" if self.running else "Play"
            )

        def restart_cycle(self):
            self.frame = 0.0
            self.setup_visualization()

        # --------------------------------------------------------
        # Visualization
        # --------------------------------------------------------
        def setup_visualization(self):
            self.rng = np.random.default_rng(8)

            if self.mode == "Carnot":
                self.visual = setup_carnot_artists(
                    self.fig,
                    self.ax_engine,
                    self.ax_plot1,
                    self.ax_plot2,
                    self.carnot,
                    self.rng,
                )
            else:
                self.visual = setup_engine_artists(
                    self.fig,
                    self.ax_engine,
                    self.ax_plot1,
                    self.ax_plot2,
                    self.engine,
                    self.rng,
                )

            self.update_frame(draw_canvas=True)

        def update_frame(self, draw_canvas=False):
            if self.mode == "Carnot":
                update_carnot_artists(
                    self.visual,
                    int(self.frame),
                    speed=self.speed,
                )

                d = self.carnot
                rel_error = abs(d["W_numeric"] - d["W_net"]) / d["W_net"]

                self.status_var.set(
                    f"Q_H = {d['Q_H']:.0f} J    |    "
                    f"|Q_C| = {d['Q_C_mag']:.0f} J    |    "
                    f"W_net = {d['W_net']:.0f} J    |    "
                    f"η_Carnot = -W_net/Q_H = {100*d['eta']:.1f}%    |    "
                    f"P–V validation error = {100*rel_error:.4f}%"
                )

            else:
                update_engine_artists(
                    self.visual,
                    int(self.frame),
                    speed=self.speed,
                )

                d = self.engine

                self.status_var.set(
                    f"Q_release = {d['Q_release']:.0f} J    |    "
                    f"W_ind = {d['W_indicated']:.0f} J/cycle    |    "
                    f"η_ind = -W_ind/Q_release = {100*d['eta_indicated']:.1f}%    |    "
                    f"η_Otto,ideal = {100*d['eta_otto_ideal']:.1f}%    |    "
                    f"P_ind ≈ {d['indicated_power']/1000:.2f} kW"
                )

            if draw_canvas:
                self.canvas.draw_idle()

        def schedule_next_frame(self):
            if self.running:
                self.frame += self.speed

                if self.mode == "Carnot":
                    self.frame %= len(self.carnot["V"])
                else:
                    self.frame %= len(self.engine["crank_deg"])

                self.update_frame(draw_canvas=True)

            self.after_id = self.root.after(
                35,
                self.schedule_next_frame,
            )

        def on_close(self):
            if self.after_id is not None:
                try:
                    self.root.after_cancel(self.after_id)
                except Exception:
                    pass
            self.root.destroy()

    root = tk.Tk()

    # A native theme usually behaves better under OS scaling than
    # heavily customized widget dimensions.
    try:
        style = ttk.Style(root)
        available = style.theme_names()

        for candidate in ("aqua", "vista", "clam"):
            if candidate in available:
                style.theme_use(candidate)
                break
    except Exception:
        pass

    App(root)
    root.mainloop()


# ============================================================
# STATIC PREVIEW
# ============================================================

def save_snapshot(mode, output):
    rng = np.random.default_rng(8)

    fig, ax_engine, ax1, ax2 = create_main_figure()

    if mode == "carnot":
        data = build_carnot_cycle()
        state = setup_carnot_artists(
            fig, ax_engine, ax1, ax2, data, rng
        )
        update_carnot_artists(state, 85, 1.0)

    elif mode == "engine":
        data = build_four_stroke_engine()
        state = setup_engine_artists(
            fig, ax_engine, ax1, ax2, data, rng
        )
        update_engine_artists(state, 430, 1.0)

    else:
        raise ValueError("Snapshot mode must be 'carnot' or 'engine'.")

    fig.savefig(output, dpi=175)
    print(f"Saved {mode} snapshot: {output}")


# ============================================================
# CLI
# ============================================================

def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run physics validation and exit.",
    )

    parser.add_argument(
        "--snapshot",
        nargs=2,
        metavar=("MODE", "OUTPUT"),
        help="Save main-canvas preview. MODE = carnot or engine.",
    )

    args = parser.parse_args()

    if args.self_test:
        ok, _ = physics_self_test(verbose=True)
        raise SystemExit(0 if ok else 1)

    if args.snapshot:
        mode, output = args.snapshot
        save_snapshot(mode.lower(), output)
        return

    run_gui()


if __name__ == "__main__":
    main()
