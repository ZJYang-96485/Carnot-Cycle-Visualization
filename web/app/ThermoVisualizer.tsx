"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  buildThermalCycle,
  CarnotCycle,
  CarnotInputs,
  CycleModel,
  CyclePoint,
  cycleModelLabel,
  DEFAULT_INPUTS,
  THERMAL_INPUT_FIELDS,
} from "./lib/carnot";
import {
  buildFourStrokeEngine,
  DEFAULT_ENGINE_INPUTS,
  EngineCycle,
  EngineInputs,
  EnginePoint,
  ENGINE_INPUT_FIELDS,
} from "./lib/fourStroke";

type ThermalDraft = Record<keyof CarnotInputs, string>;
type EngineDraft = Record<keyof EngineInputs, string>;
type VisualizerModel = CycleModel | "four-stroke";
type ChartKind = "pv" | "ts";
type EngineChartKind = "pv" | "crank";

const MODEL_OPTIONS: Array<{
  value: VisualizerModel;
  label: string;
  description: string;
}> = [
  {
    value: "carnot",
    label: "Reversible Carnot cycle",
    description: "Ideal reversible heat engine: η = 1 − T𝚌 / Tₕ.",
  },
  {
    value: "curzon-ahlborn",
    label: "Curzon–Ahlborn finite-time cycle",
    description: "Endoreversible maximum-power model: η = 1 − √(T𝚌 / Tₕ).",
  },
  {
    value: "four-stroke",
    label: "Four-stroke spark-ignition engine",
    description: "Finite-burn, slider-crank teaching model with intake and exhaust strokes.",
  },
];

function draftFromThermal(inputs: CarnotInputs): ThermalDraft {
  return Object.fromEntries(
    THERMAL_INPUT_FIELDS.map(({ key }) => [key, String(inputs[key])]),
  ) as ThermalDraft;
}

function draftFromEngine(inputs: EngineInputs): EngineDraft {
  return Object.fromEntries(
    ENGINE_INPUT_FIELDS.map(({ key }) => [key, String(inputs[key])]),
  ) as EngineDraft;
}

function numericDraftValue(value: string, label: string) {
  const trimmed = value.trim();
  const numeric = Number(trimmed);
  if (!trimmed || !Number.isFinite(numeric)) {
    throw new Error(`${label} must be a finite numeric value.`);
  }
  return numeric;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatValue(value: number, digits = 0) {
  if (!Number.isFinite(value)) return "—";
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000 || (absolute > 0 && absolute < 0.01)) {
    return value.toExponential(Math.max(1, digits));
  }
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function domain(values: number[]) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const spread = high - low || Math.max(Math.abs(high) * 0.16, 1);
  return [low - spread * 0.08, high + spread * 0.1] as const;
}

function createScale(values: number[], start: number, end: number, reverse = false) {
  const [minimum, maximum] = domain(values);
  return {
    minimum,
    maximum,
    position: (value: number) => {
      const fraction = (value - minimum) / (maximum - minimum);
      return reverse ? end - fraction * (end - start) : start + fraction * (end - start);
    },
  };
}

function pointsToPath<T>(points: readonly T[], xFor: (point: T) => number, yFor: (point: T) => number) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${xFor(point).toFixed(2)},${yFor(point).toFixed(2)}`)
    .join(" ");
}

function tickValues(minimum: number, maximum: number, count = 4) {
  return Array.from({ length: count + 1 }, (_, index) => minimum + ((maximum - minimum) * index) / count);
}

function interpolatePoint(points: readonly CyclePoint[], frame: number): CyclePoint {
  const currentIndex = Math.floor(frame) % points.length;
  const fraction = frame - Math.floor(frame);
  const current = points[currentIndex];
  const next = points[(currentIndex + 1) % points.length];
  const between = (start: number, end: number) => start + (end - start) * fraction;
  return {
    volume: between(current.volume, next.volume),
    pressure: between(current.pressure, next.pressure),
    temperature: between(current.temperature, next.temperature),
    entropy: between(current.entropy, next.entropy),
    stage: current.stage,
  };
}

type MotionProfile = { positions: number[] };

/** Pace thermal playback by normalized P–V path length, not equal-volume steps. */
function createThermalMotionProfile(points: readonly CyclePoint[]): MotionProfile {
  const volumes = points.map((point) => point.volume);
  const pressures = points.map((point) => point.pressure);
  const volumeSpan = Math.max(Math.max(...volumes) - Math.min(...volumes), 1e-12);
  const pressureSpan = Math.max(Math.max(...pressures) - Math.min(...pressures), 1e-12);
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    distances.push(
      distances[index - 1] + Math.hypot(
        (current.volume - previous.volume) / volumeSpan,
        (current.pressure - previous.pressure) / pressureSpan,
      ),
    );
  }
  const total = distances[distances.length - 1] || 1;
  return { positions: distances.map((distance) => distance / total) };
}

function frameAtPathPhase(profile: MotionProfile, phase: number) {
  const target = phase % 1;
  let lower = 0;
  let upper = profile.positions.length - 1;
  while (lower < upper) {
    const midpoint = Math.floor((lower + upper) / 2);
    if (profile.positions[midpoint] < target) lower = midpoint + 1;
    else upper = midpoint;
  }
  const before = profile.positions[Math.max(lower - 1, 0)];
  const after = profile.positions[lower];
  if (lower === 0 || after === before) return lower;
  return lower - 1 + (target - before) / (after - before);
}

function temperatureColor(point: CyclePoint, cycle: CarnotCycle) {
  const fraction = clamp(
    (point.temperature - cycle.workingTemperatures.cold) /
      (cycle.workingTemperatures.hot - cycle.workingTemperatures.cold),
    0,
    1,
  );
  return `hsl(${214 - fraction * 190} 84% ${46 + fraction * 8}%)`;
}

function engineTemperatureColor(point: EnginePoint, cycle: EngineCycle) {
  const fraction = clamp(
    (point.temperature - cycle.inputs.T_intake) /
      (cycle.inputs.T_peak - cycle.inputs.T_intake),
    0,
    1,
  );
  return `hsl(${213 - fraction * 190} 84% ${45 + fraction * 9}%)`;
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="metric-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function ThermalPistonScene({ cycle, point }: { cycle: CarnotCycle; point: CyclePoint }) {
  const volumes = cycle.points.map((item) => item.volume);
  const volumeFraction = clamp(
    (point.volume - Math.min(...volumes)) / (Math.max(...volumes) - Math.min(...volumes)),
    0,
    1,
  );
  // Gas is drawn below the piston: bigger volume lifts it and grows the gas region.
  const pistonY = 194 - volumeFraction * 96;
  const gasHeight = 228 - pistonY;
  const gasColor = temperatureColor(point, cycle);
  const stage = cycle.stages[point.stage];
  const particleSeed = Math.round(Math.log10(Math.abs(point.temperature) + 1) * 997 + point.stage * 71);
  const isExpansion = stage.direction === "expansion";
  const heatAmount = stage.heatDirection === "in"
    ? cycle.metrics.heatIn
    : stage.heatDirection === "out"
      ? cycle.metrics.heatOut
      : 0;
  const heatReference = Math.max(cycle.metrics.heatIn, cycle.metrics.heatOut, 1);
  const heatArrowLength = heatAmount ? 16 + (48 * heatAmount) / heatReference : 0;
  const heatArrowEnd = 93 - heatArrowLength;
  const heatPath = stage.heatDirection === "in"
    ? `M ${heatArrowEnd} 208 C ${heatArrowEnd + 8} 208, 83 208, 93 208`
    : `M 93 208 C 83 208, ${heatArrowEnd + 8} 208, ${heatArrowEnd} 208`;
  const heatLabel = stage.heatDirection === "in"
    ? `Qin = ${formatValue(heatAmount)} J`
    : `Qout = ${formatValue(heatAmount)} J`;
  const workPath = isExpansion
    ? "M 258 143 C 278 143, 292 143, 315 143"
    : "M 315 143 C 292 143, 278 143, 258 143";

  return (
    <article className="visual-card piston-card">
      <div className="card-heading">
        <div><p className="eyebrow">Working gas</p><h2>Piston chamber</h2></div>
        <span className={`stage-chip stage-${point.stage}`}>{stage.shortName}</span>
      </div>
      <svg className="piston-svg" viewBox="0 0 360 300" role="img" aria-label="Animated piston chamber following the current thermodynamic state">
        <defs>
          <linearGradient id="gas-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={gasColor} stopOpacity="0.72" />
            <stop offset="100%" stopColor={gasColor} stopOpacity="0.16" />
          </linearGradient>
          <marker id="thermal-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
        <rect className="piston-housing" x="97" y="46" width="150" height="188" rx="6" />
        <rect x="105" y={pistonY} width="134" height={gasHeight} rx="2" fill="url(#gas-fill)" />
        {Array.from({ length: 30 }, (_, index) => {
          const seed = (particleSeed + index * 53) % 97;
          const secondary = (particleSeed * 3 + index * 31) % 89;
          return <circle key={index} cx={116 + (seed / 97) * 112} cy={pistonY + 14 + (secondary / 89) * Math.max(gasHeight - 28, 1)} r="2.25" fill={gasColor} />;
        })}
        <rect className="piston-plate" x="91" y={pistonY - 6} width="162" height="13" rx="3" />
        <line className="piston-rod" x1="172" y1={pistonY - 6} x2="172" y2="29" />
        <rect className="piston-load" x="146" y="16" width="52" height="16" rx="3" />
        <text className="svg-small-label" x="172" y="28" textAnchor="middle">load</text>
        {stage.heatDirection === "none" ? (
          <g>
            <line className="insulation-mark" x1="65" x2="89" y1="202" y2="202" />
            <line className="insulation-mark" x1="65" x2="89" y1="208" y2="208" />
            <line className="insulation-mark" x1="65" x2="89" y1="214" y2="214" />
            <text className="svg-small-label" x="20" y="198">Q = 0</text>
          </g>
        ) : (
          <g>
            <path className={`heat-flow stage-${point.stage}`} d={heatPath} markerEnd="url(#thermal-arrow)" />
            <text className="svg-small-label" x="16" y="194">{heatLabel}</text>
          </g>
        )}
        <path className="work-flow" d={workPath} markerEnd="url(#thermal-arrow)" />
        <text className="svg-small-label" x="258" y="132">{stage.work}</text>
        <g className="piston-reading">
          <text x="24" y="257">T = {formatValue(point.temperature)} K</text>
          <text x="24" y="276">P = {formatValue(point.pressure / 1e3)} kPa</text>
          <text x="216" y="257">V = {formatValue(point.volume * 1e3, 1)} L</text>
          <text x="216" y="276">S = {formatValue(point.entropy, 2)} J/K</text>
        </g>
      </svg>
      <div className="stage-detail" aria-live="polite"><strong>{stage.name}</strong><p>{stage.description}</p></div>
    </article>
  );
}

function ThermalCycleChart({ cycle, point, kind }: { cycle: CarnotCycle; point: CyclePoint; kind: ChartKind }) {
  const isPv = kind === "pv";
  const xValue = (item: CyclePoint) => isPv ? item.volume * 1e3 : item.entropy;
  const yValue = (item: CyclePoint) => isPv ? item.pressure / 1e3 : item.temperature;
  const xAxis = createScale(cycle.points.map(xValue), 56, 418);
  const yAxis = createScale(cycle.points.map(yValue), 36, 244, true);
  const xFor = (item: CyclePoint) => xAxis.position(xValue(item));
  const yFor = (item: CyclePoint) => yAxis.position(yValue(item));
  const title = isPv ? "Pressure–volume cycle" : "Temperature–entropy map";
  const subtitle = isPv ? "Clockwise area = −W" : cycle.model === "curzon-ahlborn" ? "Working-fluid path: δQrev = T dS" : "δQrev = T dS";
  return (
    <article className="visual-card chart-card">
      <div className="card-heading"><div><p className="eyebrow">Cycle map</p><h2>{title}</h2></div><span className="chart-note">{subtitle}</span></div>
      <svg className="cycle-chart" viewBox="0 0 440 292" role="img" aria-label={title}>
        <g>
          {tickValues(xAxis.minimum, xAxis.maximum).map((value) => {
            const x = xAxis.position(value);
            return <g key={`x-${value}`}><line className="chart-gridline" x1={x} x2={x} y1="36" y2="244" /><text className="chart-tick" x={x} y="261" textAnchor="middle">{formatValue(value, isPv ? 0 : 1)}</text></g>;
          })}
          {tickValues(yAxis.minimum, yAxis.maximum).map((value) => {
            const y = yAxis.position(value);
            return <g key={`y-${value}`}><line className="chart-gridline" x1="56" x2="418" y1={y} y2={y} /><text className="chart-tick" x="47" y={y + 4} textAnchor="end">{formatValue(value, 0)}</text></g>;
          })}
          <line className="chart-axis" x1="56" x2="418" y1="244" y2="244" /><line className="chart-axis" x1="56" x2="56" y1="36" y2="244" />
          <text className="chart-axis-label" x="237" y="284" textAnchor="middle">{isPv ? "Volume (L)" : "Entropy (J/K)"}</text>
          <text className="chart-axis-label" transform="translate(15 140) rotate(-90)" textAnchor="middle">{isPv ? "Pressure (kPa)" : "Temperature (K)"}</text>
        </g>
        <path className="cycle-area" d={`${pointsToPath(cycle.points, xFor, yFor)} Z`} />
        {[0, 1, 2, 3].map((stage) => <path key={stage} className={`cycle-line stage-${stage}`} d={pointsToPath(cycle.points.filter((item) => item.stage === stage), xFor, yFor)} />)}
        {cycle.states.map((state, index) => <g key={`state-${index}`}><circle className="state-marker" cx={xFor(state)} cy={yFor(state)} r="4.5" /><text className="state-label" x={xFor(state) + 8} y={yFor(state) - 8}>{index + 1}</text></g>)}
        <circle className="active-marker" cx={xFor(point)} cy={yFor(point)} r="6" />
      </svg>
    </article>
  );
}

function EngineScene({ cycle, point }: { cycle: EngineCycle; point: EnginePoint }) {
  const volumeFraction = clamp((point.volume - cycle.metrics.minVolume) / (cycle.metrics.maxVolume - cycle.metrics.minVolume), 0, 1);
  const pistonY = 86 + volumeFraction * 106;
  const gasTop = 58;
  const gasHeight = Math.max(pistonY - gasTop, 8);
  const gasColor = engineTemperatureColor(point, cycle);
  const stage = cycle.stages[point.stage];
  const theta = ((point.crankAngle % 360) * Math.PI) / 180;
  const crankX = 180 + 25 * Math.sin(theta);
  const crankY = 245 - 25 * Math.cos(theta);
  const intakeOpen = point.stage === 0;
  const exhaustOpen = point.stage === 3;
  const sparkVisible = point.crankAngle >= cycle.burn.startAngle && point.crankAngle <= Math.min(cycle.burn.startAngle + 15, cycle.burn.endAngle);
  const particleSeed = Math.round(point.crankAngle * 37 + point.stage * 19);
  const particleCount = Math.round(30 * clamp(point.gasAmount / Math.max(cycle.metrics.trappedGasAmount, 1e-15), 0.1, 1));
  return (
    <article className="visual-card piston-card">
      <div className="card-heading"><div><p className="eyebrow">Mechanism and gas state</p><h2>Four-stroke cylinder</h2></div><span className={`stage-chip stage-${point.stage}`}>{stage.shortName}</span></div>
      <svg className="piston-svg" viewBox="0 0 360 300" role="img" aria-label="Animated four-stroke engine">
        <defs>
          <linearGradient id="engine-gas-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={gasColor} stopOpacity="0.75" /><stop offset="100%" stopColor={gasColor} stopOpacity="0.16" /></linearGradient>
          <marker id="engine-flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker>
        </defs>
        <rect className="piston-housing" x="113" y="46" width="134" height="160" rx="6" />
        <rect x="121" y={gasTop} width="118" height={gasHeight} rx="2" fill="url(#engine-gas-fill)" />
        {Array.from({ length: particleCount }, (_, index) => {
          const seed = (particleSeed + index * 47) % 97;
          const secondary = (particleSeed * 3 + index * 29) % 89;
          return <circle key={index} cx={131 + (seed / 97) * 98} cy={gasTop + 8 + (secondary / 89) * Math.max(gasHeight - 16, 1)} r="2.1" fill={gasColor} />;
        })}
        <rect className="piston-plate" x="107" y={pistonY - 6} width="146" height="13" rx="3" />
        <line className="engine-rod" x1="180" y1={pistonY + 7} x2={crankX} y2={crankY} /><circle className="engine-crank" cx="180" cy="245" r="30" /><line className="engine-crank-arm" x1="180" y1="245" x2={crankX} y2={crankY} /><circle className="engine-pin" cx={crankX} cy={crankY} r="5" />
        <line className={`engine-valve ${intakeOpen ? "is-open" : ""}`} x1="142" y1="40" x2="142" y2={intakeOpen ? 72 : 61} /><line className={`engine-valve ${exhaustOpen ? "is-open" : ""}`} x1="218" y1="40" x2="218" y2={exhaustOpen ? 72 : 61} />
        <text className="svg-small-label" x="102" y="39" textAnchor="end">intake</text><text className="svg-small-label" x="258" y="39">exhaust</text>
        {intakeOpen ? <path className="engine-flow" d="M 48 70 C 73 70, 92 70, 116 70" markerEnd="url(#engine-flow-arrow)" /> : null}
        {exhaustOpen ? <path className="engine-flow" d="M 244 70 C 268 70, 289 70, 313 70" markerEnd="url(#engine-flow-arrow)" /> : null}
        {sparkVisible ? <text className="engine-spark" x="180" y="52" textAnchor="middle">✦</text> : null}
        <g className="piston-reading"><text x="22" y="257">θ = {formatValue(point.crankAngle)}°</text><text x="22" y="276">P = {formatValue(point.pressure / 1e5, 2)} bar</text><text x="207" y="257">T = {formatValue(point.temperature)} K</text><text x="207" y="276">V = {formatValue(point.volume * 1e6)} cm³</text></g>
      </svg>
      <div className="stage-detail" aria-live="polite"><strong>{stage.name}</strong><p>{stage.description}</p></div>
    </article>
  );
}

function EngineChart({ cycle, point, kind }: { cycle: EngineCycle; point: EnginePoint; kind: EngineChartKind }) {
  const isPv = kind === "pv";
  const xValue = (item: EnginePoint) => isPv ? item.volume * 1e6 : item.crankAngle;
  const yValue = (item: EnginePoint) => item.pressure / 1e5;
  const xAxis = createScale(cycle.points.map(xValue), 56, 418);
  const yAxis = createScale(cycle.points.map(yValue), 36, 244, true);
  const xFor = (item: EnginePoint) => xAxis.position(xValue(item));
  const yFor = (item: EnginePoint) => yAxis.position(yValue(item));
  const title = isPv ? "Pressure–volume loop" : "Pressure versus crank angle";
  return (
    <article className="visual-card chart-card">
      <div className="card-heading"><div><p className="eyebrow">Engine map</p><h2>{title}</h2></div><span className="chart-note">{isPv ? "Loop includes pumping work" : "720° = one cycle"}</span></div>
      <svg className="cycle-chart" viewBox="0 0 440 292" role="img" aria-label={title}>
        <g>
          {tickValues(xAxis.minimum, xAxis.maximum).map((value) => { const x = xAxis.position(value); return <g key={`x-${value}`}><line className="chart-gridline" x1={x} x2={x} y1="36" y2="244" /><text className="chart-tick" x={x} y="261" textAnchor="middle">{formatValue(value, 0)}</text></g>; })}
          {tickValues(yAxis.minimum, yAxis.maximum).map((value) => { const y = yAxis.position(value); return <g key={`y-${value}`}><line className="chart-gridline" x1="56" x2="418" y1={y} y2={y} /><text className="chart-tick" x="47" y={y + 4} textAnchor="end">{formatValue(value, 1)}</text></g>; })}
          <line className="chart-axis" x1="56" x2="418" y1="244" y2="244" /><line className="chart-axis" x1="56" x2="56" y1="36" y2="244" />
          <text className="chart-axis-label" x="237" y="284" textAnchor="middle">{isPv ? "Volume (cm³)" : "Crank angle (°)"}</text><text className="chart-axis-label" transform="translate(15 140) rotate(-90)" textAnchor="middle">Pressure (bar)</text>
        </g>
        {isPv ? <path className="cycle-area" d={`${pointsToPath(cycle.points, xFor, yFor)} Z`} /> : null}
        {[0, 1, 2, 3].map((stage) => <path key={stage} className={`cycle-line stage-${stage}`} d={pointsToPath(cycle.points.filter((item) => item.stage === stage), xFor, yFor)} />)}
        <circle className="active-marker" cx={xFor(point)} cy={yFor(point)} r="6" />
      </svg>
    </article>
  );
}

function thermalConstraintText(model: CycleModel) {
  const base = "No arbitrary upper caps: Tₕ > T𝚌 > 0, V₁ > 0, V₂/V₁ > 1, γ > 1, and n > 0 are enforced.";
  return model === "curzon-ahlborn" ? `${base} Tₕ and T𝚌 are reservoir temperatures; working-gas temperatures are derived.` : base;
}

function thermalBound(key: keyof CarnotInputs) {
  const bounds: Record<keyof CarnotInputs, string> = { T_hot: "Tₕ > T𝚌", T_cold: "0 < T𝚌 < Tₕ", V1_L: "V₁ > 0", iso_ratio: "V₂/V₁ > 1", gamma: "γ > 1", n: "n > 0" };
  return bounds[key];
}

function engineBound(key: keyof EngineInputs) {
  const bounds: Record<keyof EngineInputs, string> = {
    compression_ratio: "r > 1",
    T_intake: "Tᵢ > 0",
    T_peak: "Tₚ > T₂",
    gamma: "γ > 1",
    displacement_cc: "Vd > 0",
    rpm: "N > 0",
    burn_duration_deg: "20–100°",
  };
  return bounds[key];
}

export default function ThermoVisualizer() {
  const [model, setModel] = useState<VisualizerModel>("carnot");
  const [thermalInputs, setThermalInputs] = useState<CarnotInputs>(DEFAULT_INPUTS);
  const [engineInputs, setEngineInputs] = useState<EngineInputs>(DEFAULT_ENGINE_INPUTS);
  const [thermalDraft, setThermalDraft] = useState<ThermalDraft>(() => draftFromThermal(DEFAULT_INPUTS));
  const [engineDraft, setEngineDraft] = useState<EngineDraft>(() => draftFromEngine(DEFAULT_ENGINE_INPUTS));
  const [cycle, setCycle] = useState<CarnotCycle | EngineCycle>(() => buildThermalCycle("carnot", DEFAULT_INPUTS));
  const [activeFrame, setActiveFrame] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [isRunning, setIsRunning] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Live model ready.");
  const [reducedMotion, setReducedMotion] = useState(false);
  const frameRef = useRef(0);
  const thermalMotion = useMemo(() => cycle.model === "four-stroke" ? null : createThermalMotionProfile(cycle.points), [cycle]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (!isRunning || reducedMotion) return undefined;
    let animationFrame = 0;
    let previousTime = performance.now();
    const animate = (timestamp: number) => {
      const elapsed = Math.min(timestamp - previousTime, 80);
      previousTime = timestamp;
      if (cycle.model === "four-stroke") {
        frameRef.current = (frameRef.current + (elapsed / 12) * speed) % cycle.points.length;
        setActiveFrame(frameRef.current);
      } else if (thermalMotion) {
        frameRef.current = (frameRef.current + (elapsed / 9_000) * speed) % 1;
        setActiveFrame(frameAtPathPhase(thermalMotion, frameRef.current));
      }
      animationFrame = window.requestAnimationFrame(animate);
    };
    animationFrame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [cycle, isRunning, reducedMotion, speed, thermalMotion]);

  const resetPlayback = () => { frameRef.current = 0; setActiveFrame(0); };

  const selectModel = (nextModel: VisualizerModel) => {
    try {
      const nextCycle = nextModel === "four-stroke" ? buildFourStrokeEngine(engineInputs) : buildThermalCycle(nextModel, thermalInputs);
      setModel(nextModel);
      setCycle(nextCycle);
      resetPlayback();
      setError("");
      setNotice(nextModel === "four-stroke" ? "Four-stroke engine selected. Animation now follows uniform crank angle." : `${cycleModelLabel(nextModel)} selected. Animation now follows the P–V path.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The selected model could not be initialized.");
    }
  };

  const applyInputs = () => {
    try {
      if (model === "four-stroke") {
        const nextInputs = {} as EngineInputs;
        for (const field of ENGINE_INPUT_FIELDS) nextInputs[field.key] = numericDraftValue(engineDraft[field.key], field.label);
        setEngineInputs(nextInputs);
        setCycle(buildFourStrokeEngine(nextInputs));
      } else {
        const nextInputs = {} as CarnotInputs;
        for (const field of THERMAL_INPUT_FIELDS) nextInputs[field.key] = numericDraftValue(thermalDraft[field.key], field.label);
        setThermalInputs(nextInputs);
        setCycle(buildThermalCycle(model, nextInputs));
      }
      resetPlayback();
      setError("");
      setNotice("Inputs applied. Animation restarted at the first state.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The entered values could not be applied.");
    }
  };

  const resetInputs = () => {
    if (model === "four-stroke") {
      setEngineInputs(DEFAULT_ENGINE_INPUTS);
      setEngineDraft(draftFromEngine(DEFAULT_ENGINE_INPUTS));
      setCycle(buildFourStrokeEngine(DEFAULT_ENGINE_INPUTS));
    } else {
      setThermalInputs(DEFAULT_INPUTS);
      setThermalDraft(draftFromThermal(DEFAULT_INPUTS));
      setCycle(buildThermalCycle(model, DEFAULT_INPUTS));
    }
    resetPlayback();
    setError("");
    setNotice("Safe default values restored.");
  };

  const activeIndex = Math.floor(activeFrame) % cycle.points.length;
  const thermalCycle = cycle.model === "four-stroke" ? null : cycle;
  const engineCycle = cycle.model === "four-stroke" ? cycle : null;
  const thermalPoint = thermalCycle ? interpolatePoint(thermalCycle.points, activeFrame) : null;
  const enginePoint = engineCycle ? engineCycle.points[activeIndex] : null;
  const activeStage = thermalCycle && thermalPoint ? thermalCycle.stages[thermalPoint.stage] : engineCycle && enginePoint ? engineCycle.stages[enginePoint.stage] : null;
  const thermalWorkCheck = thermalCycle ? Math.abs(thermalCycle.metrics.numericWork - thermalCycle.metrics.netWork) / Math.max(Math.abs(thermalCycle.metrics.netWork), 1e-12) : null;
  const statusLine = thermalCycle
    ? `Qₕ ${formatValue(thermalCycle.metrics.heatIn)} J · |Q𝚌| ${formatValue(thermalCycle.metrics.heatOut)} J · Wnet ${formatValue(thermalCycle.metrics.netWork)} J · η ${formatValue(thermalCycle.metrics.efficiency * 100, 1)}%`
    : engineCycle
      ? `Qrelease ${formatValue(engineCycle.metrics.heatRelease)} J · Wind ${formatValue(engineCycle.metrics.indicatedWork)} J/cycle · Pind ${formatValue(engineCycle.metrics.indicatedPower / 1e3, 2)} kW`
      : "";
  const modelOption = MODEL_OPTIONS.find((option) => option.value === model) ?? MODEL_OPTIONS[0];

  return (
    <main className="thermo-app">
      <header className="app-header">
        <div><p className="eyebrow">Interactive thermodynamics lab</p><h1>Thermodynamic Engine Visualizer</h1><p className="header-copy">Compare an ideal Carnot engine, a Curzon–Ahlborn finite-time model, and a four-stroke spark-ignition engine in one live visualizer.</p></div>
        <div className="model-badge" aria-label="Current model"><span>Model</span><strong>{modelOption.label}</strong></div>
      </header>
      <div className="app-layout">
        <aside className="controls-panel" aria-label="Simulation controls">
          <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); applyInputs(); }}>
            <div className="section-heading"><div><p className="eyebrow">Simulation</p><h2>Choose a model</h2></div><span className="input-helper">Then tune inputs</span></div>
            <label className="model-select-label"><span>Cycle model</span><select aria-label="Cycle model" value={model} onChange={(event) => selectModel(event.target.value as VisualizerModel)}>{MODEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <p className="model-description">{modelOption.description}</p>
            <div className="section-heading input-heading"><div><p className="eyebrow">Model inputs</p><h2>Set the cycle</h2></div><span className="input-helper">Enter to apply</span></div>
            <p className="input-guidance">{model === "four-stroke" ? "No arbitrary upper caps. Physical checks are applied on submit; combustion duration is the explicit 20–100° range." : thermalConstraintText(model)}</p>
            {model === "four-stroke" ? (
              <div className="input-list">{ENGINE_INPUT_FIELDS.map((field) => <label className="input-card" key={field.key} title={field.help}><span className="input-label"><span>{field.label}</span><small>{engineBound(field.key)}</small></span><span className="input-control-row"><input aria-label={field.label} inputMode="decimal" min={field.min} max={field.max} step={field.step} type="number" value={engineDraft[field.key]} onChange={(event) => { setEngineDraft((current) => ({ ...current, [field.key]: event.target.value })); setError(""); }} /><span className="input-unit">{field.unit}</span></span></label>)}</div>
            ) : (
              <div className="input-list">{THERMAL_INPUT_FIELDS.map((field) => <label className="input-card" key={field.key} title={field.help}><span className="input-label"><span>{field.label}</span><small>{thermalBound(field.key)}</small></span><span className="input-control-row"><input aria-label={field.label} inputMode="decimal" min={field.min} step={field.step} type="number" value={thermalDraft[field.key]} onChange={(event) => { setThermalDraft((current) => ({ ...current, [field.key]: event.target.value })); setError(""); }} /><span className="input-unit">{field.unit}</span></span></label>)}</div>
            )}
            <div className="input-actions"><button className="primary-button" type="submit">Apply inputs</button><button className="secondary-button" type="button" onClick={resetInputs}>Defaults</button></div>
            {error ? <div className="input-alert" role="alert"><strong>Check the model inputs.</strong><span>{error}</span></div> : <p className="input-status" aria-live="polite">{notice}</p>}
          </form>
          <section className="animation-section" aria-labelledby="animation-heading">
            <div className="section-heading compact"><div><p className="eyebrow">Animation</p><h2 id="animation-heading">Playback</h2></div><output htmlFor="speed" className="speed-readout">{speed.toFixed(2)}×</output></div>
            <label className="range-label" htmlFor="speed">Speed</label><input className="speed-range" id="speed" min="0.25" max="4" step="0.25" type="range" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} />
            <div className="input-actions animation-actions"><button className="secondary-button" type="button" onClick={() => { setIsRunning((current) => !current); setNotice(isRunning ? "Animation paused." : "Animation resumed."); }}>{isRunning ? "Pause" : "Play"}</button><button className="secondary-button" type="button" onClick={() => { resetPlayback(); setNotice("Animation restarted at the first state."); }}>Restart</button></div>
            {reducedMotion ? <p className="motion-note">Motion is paused for your reduced-motion preference.</p> : null}
          </section>
          <section className="scope-section" aria-labelledby="scope-heading"><p className="eyebrow">Model scope</p><h2 id="scope-heading">{model === "carnot" ? "Idealized, reversible cycle" : model === "curzon-ahlborn" ? "Endoreversible maximum-power cycle" : "One-zone educational engine"}</h2><p>{model === "carnot" ? "A quasistatic ideal-gas teaching model. Its P–V trace is paced by curve length; it does not predict elapsed engine time." : model === "curzon-ahlborn" ? "Uses symmetric finite thermal contacts and internally reversible gas paths. It is not a universal real-engine efficiency." : "Uses slider-crank kinematics, finite-duration heat release, pumping, and blowdown; it is not CFD or detailed combustion chemistry."}</p></section>
        </aside>
        <section className="workspace" aria-label="Live thermodynamic visualization">
          {thermalCycle ? <div className="metric-grid"><MetricCard label={thermalCycle.model === "carnot" ? "Carnot efficiency" : "Curzon–Ahlborn efficiency"} value={`${formatValue(thermalCycle.metrics.efficiency * 100, 1)}%`} detail={thermalCycle.model === "carnot" ? "1 − T𝚌 / Tₕ" : "1 − √(T𝚌 / Tₕ)"} /><MetricCard label="Net work by system" value={`${formatValue(-thermalCycle.metrics.netWork)} J`} detail="DeHoff: Wnet < 0" /><MetricCard label={thermalCycle.model === "carnot" ? "Adiabatic volume ratio" : "Working-gas isotherms"} value={thermalCycle.model === "carnot" ? `${formatValue(thermalCycle.metrics.adiabaticRatio, 2)}×` : `${formatValue(thermalCycle.workingTemperatures.hot)} / ${formatValue(thermalCycle.workingTemperatures.cold)} K`} detail={thermalCycle.model === "carnot" ? "derived from T and γ" : "derived from reservoir temperatures"} /></div> : engineCycle ? <div className="metric-grid"><MetricCard label="Indicated efficiency" value={`${formatValue(engineCycle.metrics.indicatedEfficiency * 100, 1)}%`} detail="−Wind / Qrelease" /><MetricCard label="Indicated power" value={`${formatValue(engineCycle.metrics.indicatedPower / 1e3, 2)} kW`} detail={`${formatValue(engineCycle.inputs.rpm)} rpm`} /><MetricCard label="Ideal Otto reference" value={`${formatValue(engineCycle.metrics.idealOttoEfficiency * 100, 1)}%`} detail="loss-free compression benchmark" /></div> : null}
          {activeStage ? <div className="stage-strip" aria-label="Current process"><span className={`stage-dot stage-${thermalPoint?.stage ?? enginePoint?.stage ?? 0}`} aria-hidden="true" /><strong>{activeStage.name}</strong><span>{thermalCycle ? activeStage.heat : activeStage.flow}</span><span>{activeStage.work}</span></div> : null}
          <div className="visual-grid">{thermalCycle && thermalPoint ? <><ThermalPistonScene cycle={thermalCycle} point={thermalPoint} /><ThermalCycleChart cycle={thermalCycle} point={thermalPoint} kind="pv" /><ThermalCycleChart cycle={thermalCycle} point={thermalPoint} kind="ts" /></> : engineCycle && enginePoint ? <><EngineScene cycle={engineCycle} point={enginePoint} /><EngineChart cycle={engineCycle} point={enginePoint} kind="pv" /><EngineChart cycle={engineCycle} point={enginePoint} kind="crank" /></> : null}</div>
          <footer className="model-footer"><span>{statusLine}</span><span>{thermalWorkCheck !== null ? `P–V work check: ${formatValue(thermalWorkCheck * 100, 4)}% error` : engineCycle ? `Otto reference: ${formatValue(engineCycle.metrics.idealOttoEfficiency * 100, 1)}% · Carnot benchmark: ${formatValue(engineCycle.metrics.carnotBenchmarkEfficiency * 100, 1)}%` : ""}</span></footer>
        </section>
      </div>
    </main>
  );
}
