# Thermodynamic Cycle Visualizer


An interactive Python simulator that connects **thermodynamic cycles**, **piston/engine motion**, and **state-space diagrams** in one synchronized visualization.

The project currently includes two modes:

- **Carnot heat engine**: a reversible ideal-gas Carnot cycle with animated piston motion, working-gas particles, $P$-$V$ and $T$-$S$ diagrams, heat-reservoir interactions, and user-controlled thermodynamic inputs.
- **Four-stroke spark-ignition engine**: an educational one-zone engine model with slider-crank kinematics, intake/compression/power/exhaust strokes, finite-duration combustion, pumping work, and an indicated $P$-$V$ loop.

The goal is not only to plot a thermodynamic cycle, but to show how the mathematical state evolution corresponds to the motion of a physical piston and engine.

---

## Features

### Carnot Cycle

The Carnot mode visualizes the four reversible processes:

1. **Isothermal expansion** at $T_H$
2. **Reversible adiabatic expansion**
3. **Isothermal compression** at $T_C$
4. **Reversible adiabatic compression**

The interface synchronizes:

- piston position
- gas volume
- illustrative molecular motion
- gas temperature
- heat transfer to/from reservoirs
- current $P$, $V$, $T$, and $S$
- $P$-$V$ trajectory
- $T$-$S$ trajectory
- heat input and rejection
- net cycle work
- Carnot efficiency

Users can control:

- hot-reservoir temperature $T_H$
- cold-reservoir temperature $T_C$
- initial volume $V_1$
- isothermal expansion ratio $V_2/V_1$
- heat-capacity ratio $\gamma=C_P/C_V$
- number of moles $n$

### Four-Stroke Engine

The engine mode visualizes:

1. **Intake**
2. **Compression**
3. **Combustion / power**
4. **Exhaust**

The engine animation includes:

- piston
- connecting rod
- crankshaft
- intake valve
- exhaust valve
- spark event
- gas particles
- variable cylinder volume
- synchronized $P$-$V$ loop
- pressure versus crank angle
- finite-duration heat release
- indicated work and power

Users can control:

- compression ratio
- intake temperature
- target peak gas temperature
- heat-capacity ratio $\gamma$
- engine displacement
- engine speed
- combustion duration

---

## Physics

### Ideal-Gas Equation of State

The Carnot model uses

$$
PV=nRT.
$$

For an ideal gas,

$$
\gamma=\frac{C_P}{C_V}.
$$

A value near $1.40$ is a common approximation for an air-like diatomic ideal gas near ordinary temperatures.

---

## Carnot Model

### Isothermal Processes

During an isothermal process,

$$
T=\mathrm{constant},
$$

so

$$
P(V)=\frac{nRT}{V}.
$$

For the hot isothermal expansion,

$$
Q_H=nRT_H\ln\left(\frac{V_2}{V_1}\right).
$$

For the cold isothermal compression,

$$
|Q_C|=nRT_C\ln\left(\frac{V_2}{V_1}\right).
$$

### Reversible Adiabatic Processes

The adiabatic legs satisfy

$$
PV^\gamma=\mathrm{constant}
$$

and equivalently

$$
TV^{\gamma-1}=\mathrm{constant}.
$$

The required volume ratio between the hot and cold isotherms is

$$
\frac{V_3}{V_2}
=
\frac{V_4}{V_1}
=
\left(\frac{T_H}{T_C}\right)^{1/(\gamma-1)}.
$$

### Entropy

For a reversible process,

$$
dS=\frac{\delta Q_{\mathrm{rev}}}{T}.
$$

Therefore the isothermal entropy change is

$$
\Delta S=nR\ln\left(\frac{V_2}{V_1}\right),
$$

while the reversible adiabatic legs have

$$
\Delta S=0.
$$

This produces the rectangular Carnot cycle in the $T$-$S$ plane.

### Carnot Efficiency

The net work output is

$$
W_{\mathrm{out,net}}=Q_H-|Q_C|,
$$

and the thermal efficiency is

$$
\eta
=
\frac{W_{\mathrm{out,net}}}{Q_H}
=
1-\frac{T_C}{T_H}.
$$

The numerical simulator also evaluates

$$
\oint P\,dV
$$

and compares the result with the analytical Carnot work as an internal validation check.

---

## Work and Heat Sign Convention

This project follows the **DeHoff-style thermodynamic sign convention** for the first law:

$$
dU=\delta Q+\delta W.
$$

Under this convention:

- $\delta Q>0$: heat enters the system
- $\delta W>0$: work is done **on** the system by the surroundings

For reversible $P\,dV$ work,

$$
\delta W=-P\,dV.
$$

Therefore:

- expansion: $dV>0 \Rightarrow \delta W<0$
- compression: $dV<0 \Rightarrow \delta W>0$

Because heat engines are commonly discussed in terms of **work output**, the simulator also reports

$$
W_{\mathrm{out}}=-W.
$$

Thus the clockwise area enclosed by the engine $P$-$V$ cycle is displayed as positive work output:

$$
W_{\mathrm{out,net}}=\oint P\,dV.
$$

This distinction is kept explicit in the interface to avoid mixing sign conventions.

---

## Four-Stroke Engine Model

The four-stroke mode is a **one-zone educational model** rather than a CFD or detailed combustion simulation.

### Slider-Crank Kinematics

Piston displacement is calculated from

$$
x(\theta)
=
r(1-\cos\theta)
+l
-\sqrt{l^2-r^2\sin^2\theta},
$$

where:

- $r$ is the crank radius
- $l$ is the connecting-rod length
- $\theta$ is crank angle

The cylinder volume follows directly from the piston position.

### Compression and Expansion

Outside the combustion interval, the closed gas is approximated as adiabatic:

$$
PV^\gamma=\mathrm{constant}.
$$

### Finite-Duration Combustion

Instead of assuming instantaneous heat addition, the model uses a normalized Wiebe-type burn fraction:

$$
x_b(\theta)
=
\frac{
1-\exp\left[
-a
\left(
\frac{\theta-\theta_s}{\Delta\theta}
\right)^{m+1}
\right]
}{
1-e^{-a}
}.
$$

The gas temperature is advanced using the first law during combustion. The total heat release is numerically adjusted so that the simulated maximum gas temperature reaches the user-selected target peak temperature.

### Intake and Exhaust

The intake and exhaust strokes are treated as open-system approximations. The amount of gas in the cylinder varies according to

$$
n(\theta)=\frac{P(\theta)V(\theta)}{RT(\theta)}.
$$

This allows the visualization to show gas entering during intake and leaving during exhaust.

### Indicated Work

The simulated engine work is calculated directly from the full $P$-$V$ loop:

$$
W_{\mathrm{ind}}=\oint P\,dV.
$$

The indicated thermal efficiency is

$$
\eta_{\mathrm{ind}}
=
\frac{W_{\mathrm{ind}}}{Q_{\mathrm{release}}}.
$$

The corresponding ideal air-standard Otto efficiency is displayed for comparison:

$$
\eta_{\mathrm{Otto}}
=
1-\frac{1}{r_c^{\gamma-1}}.
$$

For a four-stroke engine, one thermodynamic cycle occurs every two crankshaft revolutions, so the indicated power is

$$
P_{\mathrm{ind}}
=
W_{\mathrm{ind}}
\frac{\mathrm{RPM}}{120}.
$$

---

## Installation

Clone the repository:

```bash
git clone <YOUR-REPOSITORY-URL>
cd <YOUR-REPOSITORY-NAME>
```

Install the required Python packages:

```bash
pip install numpy matplotlib
```

The interactive interface also requires **Tkinter**, which is included with many standard Python installations.

---

## Running the Simulator

Launch the interactive GUI with

```bash
python thermo_engine_visualizer_v5.py
```

The left sidebar contains model inputs and animation controls. Because the sidebar is scrollable and separated from the Matplotlib canvas, the interface remains usable on different display sizes without placing controls on top of the scientific plots.

---

## Physics Validation

The repository includes an automated physics regression test.

Run

```bash
python thermo_engine_visualizer_v5.py --self-test
```

The current implementation checks:

- Carnot efficiency identity
- Carnot energy balance
- numerical $P\,dV$ work against analytical work
- constant temperature on both isothermal legs
- $PV^\gamma=\mathrm{constant}$ on both Carnot adiabatic legs
- $Q_H=T_H\Delta S$
- $|Q_C|=T_C\Delta S$
- selected engine compression ratio against $V_{\max}/V_{\min}$
- target engine peak temperature
- constant trapped gas amount during closed strokes
- adiabatic compression before ignition
- adiabatic expansion after combustion
- numerical indicated work
- pumping-work decomposition
- physically bounded indicated efficiency
- four-stroke cycle-frequency relation
- randomized engine-parameter sweeps

At the current development stage:

```text
Physics self-test: 20/20 checks passed.
```

---

## Static Preview Generation

The main scientific canvas can also be exported without launching the GUI.

Carnot mode:

```bash
python thermo_engine_visualizer_v5.py --snapshot carnot carnot_preview.png
```

Four-stroke engine mode:

```bash
python thermo_engine_visualizer_v5.py --snapshot engine engine_preview.png
```

---

## Model Scope and Limitations

### Carnot Mode

The Carnot implementation is an idealized reversible ideal-gas model.

It assumes:

- ideal-gas behavior
- quasistatic reversible processes
- perfectly isothermal heat transfer
- perfectly adiabatic reversible expansion/compression
- no friction
- no pressure drop
- no finite-rate heat-transfer losses

The particle animation is illustrative. Particle speed is scaled approximately with $\sqrt{T}$, but the visualization is **not a molecular-dynamics simulation**.

### Four-Stroke Mode

The engine model includes:

- slider-crank kinematics
- compression and expansion
- finite-duration heat release
- intake and exhaust pumping
- blowdown approximation
- variable gas amount during open strokes
- numerical indicated work

It does **not** currently include:

- computational fluid dynamics
- turbulence
- detailed combustion chemistry
- wall heat transfer
- mechanical friction
- valve-flow coefficients
- residual-gas chemistry
- knock
- ignition-delay chemistry
- calibrated real-engine geometry

The four-stroke mode should therefore be interpreted as an educational bridge between an ideal thermodynamic cycle and the behavior of a physical reciprocating engine.

---

## Project Motivation

Traditional thermodynamics instruction often presents the Carnot cycle only as a closed curve on a $P$-$V$ or $T$-$S$ diagram.

This project instead connects

$$
\text{piston motion}
\longleftrightarrow
(P,V,T,S)
\longleftrightarrow
Q,W
\longleftrightarrow
\text{cycle efficiency}.
$$

The objective is to make the relationship between physical engine motion and thermodynamic state evolution visually intuitive while retaining a quantitatively testable physics model.

---

## Future Development

Potential extensions include:

- direct comparison of Carnot, Otto, and non-ideal engine efficiencies
- wall heat-transfer losses
- mechanical friction
- finite valve timing
- residual-gas fraction
- more realistic combustion models
- Diesel and Brayton cycles
- entropy-generation visualization
- energy-flow / Sankey diagrams
- export of simulation data to CSV
- interactive parameter sweeps
- packaged desktop application

---

## Repository Structure

A minimal repository can be organized as

```text
.
├── thermo_engine_visualizer_v5.py
├── README.md
└── docs/
    ├── carnot_preview.png
    └── engine_preview.png
```

The `docs/` preview images are optional.

---

## Notes

This project is intended primarily for **thermodynamics education and computational visualization**. It should not be used as a replacement for experimentally calibrated engine-design software or high-fidelity combustion simulation.
