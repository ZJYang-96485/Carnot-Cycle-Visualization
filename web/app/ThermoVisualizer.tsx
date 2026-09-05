"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  buildCarnotCycle,
  CarnotCycle,
  CarnotInputs,
  CyclePoint,
  DEFAULT_INPUTS,
} from "./lib/carnot";

type InputKey = keyof CarnotInputs;
type DraftInputs = Record<InputKey, string>;
type ChartKind = "pv" | "ts";

const INPUT_FIELDS: Array<{
  key: InputKey;
  label: string;
  symbol: string;
  unit: string;
  min: number;
  step: number;
}> = [
  {
    key: "T_hot",
    label: "Hot temperature",
    symbol: "Tₕ",
    unit: "K",
    min: 1,
    step: 1,
  },
  {
    key: "T_cold",
    label: "Cold temperature",
    symbol: "T𝚌",
    unit: "K",
    min: 1,
    step: 1,
  },
  {
    key: "V1_L",
    label: "Initial volume",
    symbol: "V₁",
    unit: "L",
    min: 0.01,
    step: 0.1,
  },
  {
    key: "iso_ratio",
    label: "Expansion ratio",
    symbol: "V₂ / V₁",
    unit: "×",
    min: 1.01,
    step: 0.01,
  },
  {
    key: "gamma",
    label: "Heat-capacity ratio",
    symbol: "γ",
    unit: "ratio",
    min: 1.01,
    step: 0.01,
  },
  {
    key: "n",
    label: "Gas amount",
    symbol: "n",
    unit: "mol",
    min: 0.001,
    step: 0.01,
  },
];

function draftFrom(inputs: CarnotInputs): DraftInputs {
  return Object.fromEntries(
    INPUT_FIELDS.map(({ key }) => [key, String(inputs[key])]),
  ) as DraftInputs;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatValue(value: number, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function temperatureColor(point: CyclePoint, cycle: CarnotCycle) {
  const fraction = clamp(
    (point.temperature - cycle.inputs.T_cold) /
      (cycle.inputs.T_hot - cycle.inputs.T_cold),
    0,
    1,
  );
  return `hsl(${214 - fraction * 190} 84% ${46 + fraction * 8}%)`;
}

function domain(values: number[]) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const spread = high - low || Math.max(Math.abs(high) * 0.16, 1);
  return [low - spread * 0.08, high + spread * 0.1] as const;
}

function createScale(
  values: number[],
  start: number,
  end: number,
  reverse = false,
) {
  const [minimum, maximum] = domain(values);
  return {
    minimum,
    maximum,
    position: (value: number) => {
      const fraction = (value - minimum) / (maximum - minimum);
      return reverse
        ? end - fraction * (end - start)
        : start + fraction * (end - start);
    },
  };
}

function pointsToPath(
  points: CyclePoint[],
  xFor: (point: CyclePoint) => number,
  yFor: (point: CyclePoint) => number,
) {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${xFor(point).toFixed(2)},${yFor(point).toFixed(2)}`,
    )
    .join(" ");
}

function tickValues(minimum: number, maximum: number, count = 4) {
  return Array.from(
    { length: count + 1 },
    (_, index) => minimum + ((maximum - minimum) * index) / count,
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="metric-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function PistonScene({
  cycle,
  point,
  stageIndex,
}: {
  cycle: CarnotCycle;
  point: CyclePoint;
  stageIndex: number;
}) {
  const volumes = cycle.points.map((item) => item.volume);
  const volumeFraction =
    (point.volume - Math.min(...volumes)) /
    (Math.max(...volumes) - Math.min(...volumes));
  const pistonY = 98 + volumeFraction * 96;
  const gasHeight = 228 - pistonY;
  const gasColor = temperatureColor(point, cycle);
  const stage = cycle.stages[stageIndex];
  const baseParticleSeed = Math.round(point.volume * 1e7 + point.temperature);

  return (
    <article className="visual-card piston-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Working gas</p>
          <h2>Piston chamber</h2>
        </div>
        <span className={`stage-chip stage-${stageIndex}`}>{stage.shortName}</span>
      </div>

      <svg
        className="piston-svg"
        viewBox="0 0 360 300"
        role="img"
        aria-labelledby="piston-title piston-description"
      >
        <title id="piston-title">Animated piston chamber</title>
        <desc id="piston-description">
          The piston position and gas color respond to the current volume and
          temperature in the Carnot cycle.
        </desc>
        <defs>
          <linearGradient id="gas-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={gasColor} stopOpacity="0.72" />
            <stop offset="100%" stopColor={gasColor} stopOpacity="0.16" />
          </linearGradient>
          <marker
            id="heat-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>

        <rect className="piston-housing" x="97" y="46" width="150" height="188" rx="6" />
        <rect
          x="105"
          y={pistonY}
          width="134"
          height={gasHeight}
          rx="2"
          fill="url(#gas-fill)"
        />
        {Array.from({ length: 30 }, (_, index) => {
          const seed = (baseParticleSeed + index * 53) % 97;
          const secondary = (baseParticleSeed * 3 + index * 31) % 89;
          const x = 116 + (seed / 97) * 112;
          const y = pistonY + 14 + (secondary / 89) * Math.max(gasHeight - 28, 1);
          return <circle key={index} cx={x} cy={y} r="2.25" fill={gasColor} />;
        })}
        <rect className="piston-plate" x="91" y={pistonY - 6} width="162" height="13" rx="3" />
        <line className="piston-rod" x1="172" y1={pistonY - 6} x2="172" y2="29" />
        <rect className="piston-load" x="146" y="16" width="52" height="16" rx="3" />
        <text className="svg-small-label" x="172" y="28" textAnchor="middle">
          load
        </text>

        <path
          className={`heat-flow stage-${stageIndex}`}
          d="M 56 208 C 70 208, 78 208, 93 208"
          markerEnd="url(#heat-arrow)"
        />
        <text className="svg-small-label" x="21" y="198">
          {stage.heat}
        </text>
        <path
          className="work-flow"
          d="M 268 143 C 286 143, 292 143, 315 143"
          markerEnd="url(#heat-arrow)"
        />
        <text className="svg-small-label" x="262" y="132">
          {stage.work}
        </text>

        <g className="piston-reading">
          <text x="24" y="257">T = {formatValue(point.temperature)} K</text>
          <text x="24" y="276">P = {formatValue(point.pressure / 1e3)} kPa</text>
          <text x="216" y="257">V = {formatValue(point.volume * 1e3, 1)} L</text>
          <text x="216" y="276">S = {formatValue(point.entropy, 2)} J/K</text>
        </g>
      </svg>

      <div className="stage-detail" aria-live="polite">
        <strong>{stage.name}</strong>
        <p>{stage.description}</p>
      </div>
    </article>
  );
}

function CycleChart({
  cycle,
  point,
  kind,
}: {
  cycle: CarnotCycle;
  point: CyclePoint;
  kind: ChartKind;
}) {
  const isPv = kind === "pv";
  const xValue = (item: CyclePoint) =>
    isPv ? item.volume * 1e3 : item.entropy;
  const yValue = (item: CyclePoint) =>
    isPv ? item.pressure / 1e3 : item.temperature;
  const xAxis = createScale(cycle.points.map(xValue), 56, 418);
  const yAxis = createScale(cycle.points.map(yValue), 36, 244, true);
  const xFor = (item: CyclePoint) => xAxis.position(xValue(item));
  const yFor = (item: CyclePoint) => yAxis.position(yValue(item));
  const fullPath = `${pointsToPath(cycle.points, xFor, yFor)} Z`;
  const xTicks = tickValues(xAxis.minimum, xAxis.maximum);
  const yTicks = tickValues(yAxis.minimum, yAxis.maximum);
  const title = isPv ? "Pressure–volume cycle" : "Temperature–entropy cycle";
  const subtitle = isPv ? "Clockwise area = −W" : "δQrev = T dS";
  const xLabel = isPv ? "Volume (L)" : "Entropy (J/K)";
  const yLabel = isPv ? "Pressure (kPa)" : "Temperature (K)";
  const formatX = (value: number) => formatValue(value, isPv ? 0 : 1);
  const formatY = (value: number) => formatValue(value, 0);

  return (
    <article className="visual-card chart-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Cycle map</p>
          <h2>{title}</h2>
        </div>
        <span className="chart-note">{subtitle}</span>
      </div>

      <svg
        className="cycle-chart"
        viewBox="0 0 440 292"
        role="img"
        aria-label={`${title}. The colored path shows all four Carnot processes and the highlighted dot marks the current state.`}
      >
        <g>
          {xTicks.map((value) => {
            const x = xAxis.position(value);
            return (
              <g key={`x-${value}`}>
                <line className="chart-gridline" x1={x} x2={x} y1="36" y2="244" />
                <text className="chart-tick" x={x} y="261" textAnchor="middle">
                  {formatX(value)}
                </text>
              </g>
            );
          })}
          {yTicks.map((value) => {
            const y = yAxis.position(value);
            return (
              <g key={`y-${value}`}>
                <line className="chart-gridline" x1="56" x2="418" y1={y} y2={y} />
                <text className="chart-tick" x="47" y={y + 4} textAnchor="end">
                  {formatY(value)}
                </text>
              </g>
            );
          })}
          <line className="chart-axis" x1="56" x2="418" y1="244" y2="244" />
          <line className="chart-axis" x1="56" x2="56" y1="36" y2="244" />
          <text className="chart-axis-label" x="237" y="284" textAnchor="middle">
            {xLabel}
          </text>
          <text
            className="chart-axis-label"
            transform="translate(15 140) rotate(-90)"
            textAnchor="middle"
          >
            {yLabel}
          </text>
        </g>

        <path className="cycle-area" d={fullPath} />
        {[0, 1, 2, 3].map((stage) => {
          const segment = cycle.points.filter((item) => item.stage === stage);
          return (
            <path
              key={stage}
              className={`cycle-line stage-${stage}`}
              d={pointsToPath(segment, xFor, yFor)}
            />
          );
        })}
        {cycle.states.map((state, index) => (
          <g key={`state-${index}`}>
            <circle className="state-marker" cx={xFor(state)} cy={yFor(state)} r="4.5" />
            <text className="state-label" x={xFor(state) + 8} y={yFor(state) - 8}>
              {index + 1}
            </text>
          </g>
        ))}
        <circle
          className="active-marker"
          cx={xFor(point)}
          cy={yFor(point)}
          r="6"
        />
      </svg>
    </article>
  );
}

export default function ThermoVisualizer() {
  const [draft, setDraft] = useState<DraftInputs>(() => draftFrom(DEFAULT_INPUTS));
  const [cycle, setCycle] = useState<CarnotCycle>(() =>
    buildCarnotCycle(DEFAULT_INPUTS),
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [isRunning, setIsRunning] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Live model ready.");
  const [reducedMotion, setReducedMotion] = useState(false);
  const frameRef = useRef(0);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (!isRunning || reducedMotion) {
      return undefined;
    }

    let animationFrame = 0;
    let previousTime = performance.now();
    const animate = (timestamp: number) => {
      const elapsed = timestamp - previousTime;
      previousTime = timestamp;
      frameRef.current =
        (frameRef.current + (elapsed / 35) * speed) % cycle.points.length;
      setActiveIndex(Math.floor(frameRef.current));
      animationFrame = window.requestAnimationFrame(animate);
    };
    animationFrame = window.requestAnimationFrame(animate);

    return () => window.cancelAnimationFrame(animationFrame);
  }, [cycle.points.length, isRunning, reducedMotion, speed]);

  const activePoint = cycle.points[activeIndex] ?? cycle.points[0];
  const stage = cycle.stages[activePoint.stage];
  const validationError =
    Math.abs(cycle.metrics.numericWork - cycle.metrics.netWork) /
    Math.abs(cycle.metrics.netWork);
  const statusLine = useMemo(
    () =>
      `Qₕ ${formatValue(cycle.metrics.heatIn)} J · |Q𝚌| ${formatValue(cycle.metrics.heatOut)} J · Wnet ${formatValue(cycle.metrics.netWork)} J · η ${formatValue(cycle.metrics.efficiency * 100, 1)}%`,
    [cycle],
  );

  const applyInputs = () => {
    try {
      const nextInputs = {} as CarnotInputs;
      for (const field of INPUT_FIELDS) {
        const rawValue = draft[field.key].trim();
        const value = Number(rawValue);
        if (!rawValue || !Number.isFinite(value)) {
          throw new Error(`${field.label} must be a finite numeric value.`);
        }
        nextInputs[field.key] = value;
      }

      const nextCycle = buildCarnotCycle(nextInputs);
      setCycle(nextCycle);
      frameRef.current = 0;
      setActiveIndex(0);
      setError("");
      setNotice("Inputs applied. Animation restarted at state 1.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The entered values could not be applied.",
      );
    }
  };

  const resetInputs = () => {
    const defaultCycle = buildCarnotCycle(DEFAULT_INPUTS);
    setDraft(draftFrom(DEFAULT_INPUTS));
    setCycle(defaultCycle);
    frameRef.current = 0;
    setActiveIndex(0);
    setError("");
    setNotice("Safe default values restored.");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    applyInputs();
  };

  const restart = () => {
    frameRef.current = 0;
    setActiveIndex(0);
    setNotice("Animation restarted at state 1.");
  };

  return (
    <main className="thermo-app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Interactive thermodynamics lab</p>
          <h1>Thermodynamic Engine Visualizer</h1>
          <p className="header-copy">
            Tune a reversible Carnot cycle and watch its piston, P–V loop, and
            T–S map update together.
          </p>
        </div>
        <div className="model-badge" aria-label="Current model">
          <span>Model</span>
          <strong>Reversible Carnot cycle</strong>
        </div>
      </header>

      <div className="app-layout">
        <aside className="controls-panel" aria-label="Carnot cycle controls">
          <form onSubmit={handleSubmit}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Model inputs</p>
                <h2>Set the cycle</h2>
              </div>
              <span className="input-helper">Press Enter to apply</span>
            </div>

            <div className="input-list">
              {INPUT_FIELDS.map((field) => (
                <label className="input-card" key={field.key}>
                  <span className="input-label">
                    <span>{field.label}</span>
                    <small>{field.symbol}</small>
                  </span>
                  <span className="input-control-row">
                    <input
                      aria-label={field.label}
                      inputMode="decimal"
                      min={field.min}
                      step={field.step}
                      type="number"
                      value={draft[field.key]}
                      onChange={(event) => {
                        setDraft((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }));
                        setError("");
                      }}
                    />
                    <span className="input-unit">{field.unit}</span>
                  </span>
                </label>
              ))}
            </div>

            <div className="input-actions">
              <button className="primary-button" type="submit">
                Apply inputs
              </button>
              <button className="secondary-button" type="button" onClick={resetInputs}>
                Defaults
              </button>
            </div>

            {error ? (
              <div className="input-alert" role="alert">
                <strong>Check the model inputs.</strong>
                <span>{error}</span>
              </div>
            ) : (
              <p className="input-status" aria-live="polite">
                {notice}
              </p>
            )}
          </form>

          <section className="animation-section" aria-labelledby="animation-heading">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Animation</p>
                <h2 id="animation-heading">Playback</h2>
              </div>
              <output htmlFor="speed" className="speed-readout">
                {speed.toFixed(2)}×
              </output>
            </div>
            <label className="range-label" htmlFor="speed">
              Speed
            </label>
            <input
              className="speed-range"
              id="speed"
              min="0.25"
              max="4"
              step="0.25"
              type="range"
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
            />
            <div className="input-actions animation-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setIsRunning((current) => !current);
                  setNotice(isRunning ? "Animation paused." : "Animation resumed.");
                }}
              >
                {isRunning ? "Pause" : "Play"}
              </button>
              <button className="secondary-button" type="button" onClick={restart}>
                Restart cycle
              </button>
            </div>
            {reducedMotion ? (
              <p className="motion-note">Motion is paused for your reduced-motion preference.</p>
            ) : null}
          </section>

          <section className="scope-section" aria-labelledby="scope-heading">
            <p className="eyebrow">Model scope</p>
            <h2 id="scope-heading">Idealized, reversible cycle</h2>
            <p>
              This view assumes an ideal gas and reversible processes. It is a
              teaching model, not a detailed engine or combustion simulation.
            </p>
          </section>
        </aside>

        <section className="workspace" aria-label="Live Carnot cycle visualization">
          <div className="metric-grid">
            <MetricCard
              label="Carnot efficiency"
              value={`${formatValue(cycle.metrics.efficiency * 100, 1)}%`}
              detail="1 − T𝚌 / Tₕ"
            />
            <MetricCard
              label="Net work by system"
              value={`${formatValue(-cycle.metrics.netWork)} J`}
              detail="DeHoff: Wnet < 0"
            />
            <MetricCard
              label="Adiabatic volume ratio"
              value={`${formatValue(cycle.metrics.adiabaticRatio, 2)}×`}
              detail="kept below 30×"
            />
          </div>

          <div className="stage-strip" aria-label="Current process">
            <span className={`stage-dot stage-${activePoint.stage}`} aria-hidden="true" />
            <strong>{stage.name}</strong>
            <span>{stage.heat}</span>
            <span>{stage.work}</span>
          </div>

          <div className="visual-grid">
            <PistonScene cycle={cycle} point={activePoint} stageIndex={activePoint.stage} />
            <CycleChart cycle={cycle} point={activePoint} kind="pv" />
            <CycleChart cycle={cycle} point={activePoint} kind="ts" />
          </div>

          <footer className="model-footer">
            <span>{statusLine}</span>
            <span>P–V work check: {formatValue(validationError * 100, 4)}% error</span>
          </footer>
        </section>
      </div>
    </main>
  );
}
