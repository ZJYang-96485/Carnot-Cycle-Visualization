import { GAS_CONSTANT } from "./carnot";

/**
 * Inputs for the one-zone, four-stroke spark-ignition teaching model.
 *
 * Temperatures are absolute (K), displacement is swept volume (cm³), and
 * `rpm` is crankshaft speed. The model deliberately accepts any finite,
 * physically valid value instead of hiding arbitrary upper bounds; the
 * combustion duration is the one bounded teaching-model parameter.
 */
export type EngineInputs = {
  compression_ratio: number;
  T_intake: number;
  T_peak: number;
  gamma: number;
  displacement_cc: number;
  rpm: number;
  burn_duration_deg: number;
};

export type EngineInputKey = keyof EngineInputs;

export type EngineInputField = {
  key: EngineInputKey;
  label: string;
  symbol: string;
  unit: string;
  min: number;
  max?: number;
  step: number;
  help: string;
};

/**
 * UI-ready limits. Except for burn duration, maxima are intentionally omitted:
 * the builder checks finite derived values and explains any infeasible input.
 */
export const ENGINE_INPUT_FIELDS: readonly EngineInputField[] = [
  {
    key: "compression_ratio",
    label: "Compression ratio",
    symbol: "r",
    unit: "ratio",
    min: 1.01,
    step: 0.1,
    help: "Must exceed 1.",
  },
  {
    key: "T_intake",
    label: "Intake temperature",
    symbol: "Tᵢ",
    unit: "K",
    min: 0.1,
    step: 1,
    help: "Must be above absolute zero.",
  },
  {
    key: "T_peak",
    label: "Target peak temperature",
    symbol: "Tₚ",
    unit: "K",
    min: 0.1,
    step: 10,
    help: "Must exceed the compressed-gas temperature shown after validation.",
  },
  {
    key: "gamma",
    label: "Heat-capacity ratio",
    symbol: "γ",
    unit: "ratio",
    min: 1.01,
    step: 0.01,
    help: "Must exceed 1.",
  },
  {
    key: "displacement_cc",
    label: "Displacement",
    symbol: "Vd",
    unit: "cm³",
    min: 0.1,
    step: 10,
    help: "Swept cylinder volume; must be positive.",
  },
  {
    key: "rpm",
    label: "Engine speed",
    symbol: "N",
    unit: "rpm",
    min: 1,
    step: 100,
    help: "Must be positive. Power uses one four-stroke cycle per two revolutions.",
  },
  {
    key: "burn_duration_deg",
    label: "Combustion duration",
    symbol: "Δθᵦ",
    unit: "deg",
    min: 20,
    max: 100,
    step: 1,
    help: "The educational Wiebe heat-release model supports 20–100°.",
  },
] as const;

export const DEFAULT_ENGINE_INPUTS: EngineInputs = {
  compression_ratio: 9.5,
  T_intake: 300,
  T_peak: 2300,
  gamma: 1.35,
  displacement_cc: 500,
  rpm: 1800,
  burn_duration_deg: 60,
};

export const ENGINE_ATMOSPHERIC_PRESSURE = 101_325;
export const ENGINE_BURN_START_DEG = 350;
export const ENGINE_POINT_COUNT = 721;

export type EnginePoint = {
  crankAngle: number;
  volume: number;
  pressure: number;
  temperature: number;
  gasAmount: number;
  burnFraction: number;
  stage: number;
};

export type EngineStage = {
  name: string;
  shortName: string;
  description: string;
  flow: string;
  work: string;
};

export const ENGINE_STAGES: readonly EngineStage[] = [
  {
    name: "1. Intake stroke",
    shortName: "Intake",
    description: "The intake valve is open while fresh charge enters as cylinder volume increases.",
    flow: "Intake valve open",
    work: "Gas fills cylinder",
  },
  {
    name: "2. Compression stroke",
    shortName: "Compression",
    description:
      "Both valves are closed; the trapped charge is compressed. Heat release begins near 350°.",
    flow: "Valves closed",
    work: "Compression: W > 0",
  },
  {
    name: "3. Power stroke",
    shortName: "Power",
    description: "Finite-duration combustion and subsequent expansion produce indicated work.",
    flow: "Valves closed",
    work: "Expansion: W < 0",
  },
  {
    name: "4. Exhaust stroke",
    shortName: "Exhaust",
    description: "Blowdown is followed by expulsion of products through the exhaust valve.",
    flow: "Exhaust valve open",
    work: "Gas leaves cylinder",
  },
] as const;

export type EngineCycle = {
  model: "four-stroke";
  inputs: EngineInputs;
  points: EnginePoint[];
  stages: readonly EngineStage[];
  stageStartIndices: readonly [number, number, number, number];
  burn: {
    startAngle: number;
    endAngle: number;
  };
  metrics: {
    heatRelease: number;
    indicatedWork: number;
    closedWork: number;
    pumpingWork: number;
    indicatedEfficiency: number;
    idealOttoEfficiency: number;
    carnotBenchmarkEfficiency: number;
    indicatedPower: number;
    trappedGasAmount: number;
    intakePressure: number;
    exhaustPressure: number;
    minVolume: number;
    maxVolume: number;
    compressedGasTemperature: number;
  };
};

type ClosedSection = {
  temperatures: number[];
  pressures: number[];
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function assertFinite(name: string, value: number) {
  if (!Number.isFinite(value)) {
    throw new Error(
      `${name} is outside the numeric range of this visualizer. Reduce the entered values.`,
    );
  }
}

function validateFiniteInputs(inputs: EngineInputs) {
  for (const [name, value] of Object.entries(inputs)) {
    if (!Number.isFinite(value)) {
      throw new Error(`${name} must be a finite number.`);
    }
  }
}

/**
 * Temperature immediately after an ideal adiabatic compression. A UI can use
 * this to show the dynamic lower bound for the selected target peak temperature.
 */
export function compressedGasTemperature(
  inputs: Pick<EngineInputs, "compression_ratio" | "T_intake" | "gamma">,
) {
  return (
    inputs.T_intake *
    inputs.compression_ratio ** (inputs.gamma - 1)
  );
}

function validateEngineInputs(inputs: EngineInputs) {
  validateFiniteInputs(inputs);

  if (inputs.compression_ratio <= 1) {
    throw new Error("Compression ratio must exceed 1.");
  }
  if (inputs.T_intake <= 0) {
    throw new Error("Intake temperature must be above absolute zero.");
  }
  if (inputs.gamma <= 1) {
    throw new Error("Heat-capacity ratio γ must exceed 1.");
  }
  if (inputs.displacement_cc <= 0) {
    throw new Error("Displacement must be positive.");
  }
  if (inputs.rpm <= 0) {
    throw new Error("Engine speed must be positive.");
  }
  if (
    inputs.burn_duration_deg < 20 ||
    inputs.burn_duration_deg > 100
  ) {
    throw new Error("Combustion duration must be between 20° and 100°.");
  }

  const T2Adiabatic = compressedGasTemperature(inputs);
  assertFinite("Compressed-gas temperature", T2Adiabatic);
  if (inputs.T_peak <= 1.05 * T2Adiabatic) {
    throw new Error(
      `Target peak temperature must exceed 1.05 × the compressed-gas temperature (${T2Adiabatic.toFixed(0)} K).`,
    );
  }
}

/**
 * Slider displacement from top dead center. `angleDegrees` may extend beyond
 * one revolution; 0° and 360° are TDC, while 180° is BDC.
 */
export function sliderCrankDisplacement(
  angleDegrees: number,
  crankRadius = 1,
  rodLength = 3.5,
) {
  const theta = ((angleDegrees % 360) * Math.PI) / 180;
  const underRoot = Math.max(
    rodLength ** 2 - (crankRadius * Math.sin(theta)) ** 2,
    0,
  );

  return (
    crankRadius * (1 - Math.cos(theta)) +
    rodLength -
    Math.sqrt(underRoot)
  );
}

/**
 * Normalized Wiebe-type burned fraction used for finite-duration heat release.
 */
export function wiebeFraction(
  crankAngle: number,
  startAngle = ENGINE_BURN_START_DEG,
  duration = DEFAULT_ENGINE_INPUTS.burn_duration_deg,
  a = 5,
  m = 2,
) {
  const progress = clamp((crankAngle - startAngle) / duration, 0, 1);
  const raw = 1 - Math.exp(-a * progress ** (m + 1));
  return raw / (1 - Math.exp(-a));
}

function integrateDeHoffWork(points: readonly Pick<EnginePoint, "pressure" | "volume">[]) {
  let work = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    work -=
      0.5 *
      (previous.pressure + current.pressure) *
      (current.volume - previous.volume);
  }

  return work;
}

function simulateClosedSection({
  crankAngles,
  volumes,
  startIndex,
  endIndex,
  trappedGasAmount,
  intakeTemperature,
  gamma,
  heatRelease,
  burnFractions,
}: {
  crankAngles: readonly number[];
  volumes: readonly number[];
  startIndex: number;
  endIndex: number;
  trappedGasAmount: number;
  intakeTemperature: number;
  gamma: number;
  heatRelease: number;
  burnFractions: readonly number[];
}): ClosedSection {
  const temperatures = new Array<number>(crankAngles.length).fill(Number.NaN);
  const pressures = new Array<number>(crankAngles.length).fill(Number.NaN);
  const heatCapacityAtConstantVolume = GAS_CONSTANT / (gamma - 1);

  temperatures[startIndex] = intakeTemperature;
  pressures[startIndex] =
    (trappedGasAmount * GAS_CONSTANT * intakeTemperature) /
    volumes[startIndex];

  for (let index = startIndex + 1; index <= endIndex; index += 1) {
    const adiabaticTemperature =
      temperatures[index - 1] *
      (volumes[index - 1] / volumes[index]) ** (gamma - 1);
    const heatAdded =
      heatRelease * (burnFractions[index] - burnFractions[index - 1]);

    temperatures[index] =
      adiabaticTemperature +
      heatAdded / (trappedGasAmount * heatCapacityAtConstantVolume);
    pressures[index] =
      (trappedGasAmount * GAS_CONSTANT * temperatures[index]) / volumes[index];
  }

  return { temperatures, pressures };
}

/**
 * Build the deterministic 720° one-zone four-stroke engine cycle from the
 * original desktop visualizer. It is an educational finite-burn model, not a
 * combustion-chemistry or CFD simulation.
 */
export function buildFourStrokeEngine(inputs: EngineInputs): EngineCycle {
  validateEngineInputs(inputs);

  const {
    compression_ratio,
    T_intake,
    T_peak,
    gamma,
    displacement_cc,
    rpm,
    burn_duration_deg,
  } = inputs;
  const crankAngles = Array.from(
    { length: ENGINE_POINT_COUNT },
    (_, index) => index,
  );
  const displacement = displacement_cc * 1e-6;
  const displacements = crankAngles.map((angle) => sliderCrankDisplacement(angle));
  const maximumDisplacement = Math.max(...displacements);
  const clearanceVolume = displacement / (compression_ratio - 1);
  const volumes = displacements.map(
    (pistonDisplacement) =>
      clearanceVolume + displacement * (pistonDisplacement / maximumDisplacement),
  );
  const minVolume = Math.min(...volumes);
  const maxVolume = Math.max(...volumes);
  const intakePressure = 0.96 * ENGINE_ATMOSPHERIC_PRESSURE;
  const exhaustPressure = 1.05 * ENGINE_ATMOSPHERIC_PRESSURE;
  const trappedGasAmount =
    (intakePressure * maxVolume) / (GAS_CONSTANT * T_intake);
  const compressedTemperature = compressedGasTemperature(inputs);
  const burnFractions = crankAngles.map((angle) =>
    wiebeFraction(angle, ENGINE_BURN_START_DEG, burn_duration_deg),
  );

  assertFinite("Cylinder volume", minVolume);
  assertFinite("Trapped gas amount", trappedGasAmount);

  const heatCapacityAtConstantVolume = GAS_CONSTANT / (gamma - 1);
  let heatLow = 0;
  let heatHigh =
    trappedGasAmount * heatCapacityAtConstantVolume * (T_peak - T_intake) * 5;
  assertFinite("Heat-release search range", heatHigh);

  for (let iteration = 0; iteration < 60; iteration += 1) {
    const heatMidpoint = 0.5 * (heatLow + heatHigh);
    const closedSection = simulateClosedSection({
      crankAngles,
      volumes,
      startIndex: 180,
      endIndex: 540,
      trappedGasAmount,
      intakeTemperature: T_intake,
      gamma,
      heatRelease: heatMidpoint,
      burnFractions,
    });
    const reachedPeak = Math.max(
      ...closedSection.temperatures.slice(180, 541),
    );

    if (reachedPeak < T_peak) {
      heatLow = heatMidpoint;
    } else {
      heatHigh = heatMidpoint;
    }
  }

  const heatRelease = 0.5 * (heatLow + heatHigh);
  const closedSection = simulateClosedSection({
    crankAngles,
    volumes,
    startIndex: 180,
    endIndex: 540,
    trappedGasAmount,
    intakeTemperature: T_intake,
    gamma,
    heatRelease,
    burnFractions,
  });
  const temperatures = new Array<number>(ENGINE_POINT_COUNT);
  const pressures = new Array<number>(ENGINE_POINT_COUNT);
  const gasAmounts = new Array<number>(ENGINE_POINT_COUNT);
  const stages = new Array<number>(ENGINE_POINT_COUNT);

  for (let index = 0; index < 180; index += 1) {
    pressures[index] = intakePressure;
    temperatures[index] = T_intake;
    gasAmounts[index] =
      (pressures[index] * volumes[index]) / (GAS_CONSTANT * temperatures[index]);
    stages[index] = 0;
  }

  for (let index = 180; index <= 540; index += 1) {
    pressures[index] = closedSection.pressures[index];
    temperatures[index] = closedSection.temperatures[index];
    gasAmounts[index] = trappedGasAmount;
    stages[index] = index < 360 ? 1 : 2;
  }

  const blowdownTemperature =
    temperatures[540] *
    (exhaustPressure / pressures[540]) ** ((gamma - 1) / gamma);
  const exhaustEndTemperature = Math.max(T_intake + 220, 520);

  for (let index = 541; index < ENGINE_POINT_COUNT; index += 1) {
    const progress = (crankAngles[index] - 540) / 180;
    temperatures[index] =
      blowdownTemperature + (exhaustEndTemperature - blowdownTemperature) * progress;
    pressures[index] = exhaustPressure;
    gasAmounts[index] =
      (pressures[index] * volumes[index]) / (GAS_CONSTANT * temperatures[index]);
    stages[index] = 3;
  }

  const points = crankAngles.map((crankAngle, index) => ({
    crankAngle,
    volume: volumes[index],
    pressure: pressures[index],
    temperature: temperatures[index],
    gasAmount: gasAmounts[index],
    burnFraction: burnFractions[index],
    stage: stages[index],
  }));
  const indicatedWork = integrateDeHoffWork(points);
  const closedWork = integrateDeHoffWork(points.slice(180, 541));
  const pumpingWork = (exhaustPressure - intakePressure) * displacement;
  const indicatedEfficiency = -indicatedWork / heatRelease;
  const idealOttoEfficiency =
    1 - 1 / compression_ratio ** (gamma - 1);
  const carnotBenchmarkEfficiency = 1 - T_intake / T_peak;
  const indicatedPower = (-indicatedWork * rpm) / 120;

  for (const [name, value] of Object.entries({
    "Heat release": heatRelease,
    "Indicated work": indicatedWork,
    "Indicated efficiency": indicatedEfficiency,
    "Indicated power": indicatedPower,
  })) {
    assertFinite(name, value);
  }

  return {
    model: "four-stroke",
    inputs: { ...inputs },
    points,
    stages: ENGINE_STAGES,
    stageStartIndices: [0, 180, 360, 541],
    burn: {
      startAngle: ENGINE_BURN_START_DEG,
      endAngle: ENGINE_BURN_START_DEG + burn_duration_deg,
    },
    metrics: {
      heatRelease,
      indicatedWork,
      closedWork,
      pumpingWork,
      indicatedEfficiency,
      idealOttoEfficiency,
      carnotBenchmarkEfficiency,
      indicatedPower,
      trappedGasAmount,
      intakePressure,
      exhaustPressure,
      minVolume,
      maxVolume,
      compressedGasTemperature: compressedTemperature,
    },
  };
}
