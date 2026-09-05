export const GAS_CONSTANT = 8.314462618;

export type CycleModel = "carnot" | "curzon-ahlborn";

export type CarnotInputs = {
  /** Hot reservoir temperature in kelvin. */
  T_hot: number;
  /** Cold reservoir temperature in kelvin. */
  T_cold: number;
  V1_L: number;
  iso_ratio: number;
  gamma: number;
  n: number;
};

export type ThermalInputKey = keyof CarnotInputs;

export type ThermalInputField = {
  key: ThermalInputKey;
  label: string;
  symbol: string;
  unit: string;
  min: number;
  step: number;
  help: string;
};

/**
 * The thermal model intentionally has no arbitrary upper limits. Inputs are
 * validated for physical relationships and numeric representability instead
 * of being silently clamped by the interface.
 */
export const THERMAL_INPUT_FIELDS: readonly ThermalInputField[] = [
  {
    key: "T_hot",
    label: "Hot reservoir",
    symbol: "Tₕ",
    unit: "K",
    min: 0.1,
    step: 1,
    help: "Must be greater than the cold-reservoir temperature.",
  },
  {
    key: "T_cold",
    label: "Cold reservoir",
    symbol: "T𝚌",
    unit: "K",
    min: 0.1,
    step: 1,
    help: "Must be above absolute zero and below Tₕ.",
  },
  {
    key: "V1_L",
    label: "Initial volume",
    symbol: "V₁",
    unit: "L",
    min: 0.000001,
    step: 0.1,
    help: "Must be positive.",
  },
  {
    key: "iso_ratio",
    label: "Isothermal expansion ratio",
    symbol: "V₂ / V₁",
    unit: "×",
    min: 1.0001,
    step: 0.01,
    help: "Must be greater than 1.",
  },
  {
    key: "gamma",
    label: "Heat-capacity ratio",
    symbol: "γ",
    unit: "ratio",
    min: 1.0001,
    step: 0.01,
    help: "Defaults to 5/3, the monatomic ideal-gas value. Must be greater than 1.",
  },
  {
    key: "n",
    label: "Gas amount",
    symbol: "n",
    unit: "mol",
    min: 0.000001,
    step: 0.01,
    help: "Must be positive.",
  },
] as const;

export const DEFAULT_INPUTS: CarnotInputs = {
  T_hot: 650,
  T_cold: 450,
  V1_L: 10,
  iso_ratio: 1.7,
  gamma: 5 / 3,
  n: 1,
};

export type CyclePoint = {
  volume: number;
  pressure: number;
  temperature: number;
  entropy: number;
  stage: number;
};

export type CycleStage = {
  name: string;
  shortName: string;
  description: string;
  heat: string;
  work: string;
  direction: "expansion" | "compression";
  heatDirection: "in" | "out" | "none";
};

export const CARNOT_STAGES: readonly CycleStage[] = [
  {
    name: "1 → 2  Isothermal expansion",
    shortName: "Hot isotherm",
    description:
      "Heat enters from the hot reservoir while the gas expands at constant temperature.",
    heat: "Heat flows in",
    work: "Expansion: W < 0",
    direction: "expansion",
    heatDirection: "in",
  },
  {
    name: "2 → 3  Reversible adiabatic expansion",
    shortName: "Adiabatic expansion",
    description:
      "The boundary is insulated, so Q = 0 and expansion cools the working gas.",
    heat: "Insulated: Q = 0",
    work: "Expansion: W < 0",
    direction: "expansion",
    heatDirection: "none",
  },
  {
    name: "3 → 4  Isothermal compression",
    shortName: "Cold isotherm",
    description:
      "Heat leaves to the cold reservoir while compression holds the gas at constant temperature.",
    heat: "Heat flows out",
    work: "Compression: W > 0",
    direction: "compression",
    heatDirection: "out",
  },
  {
    name: "4 → 1  Reversible adiabatic compression",
    shortName: "Adiabatic compression",
    description:
      "The boundary is insulated, so Q = 0 and compression raises the working-gas temperature.",
    heat: "Insulated: Q = 0",
    work: "Compression: W > 0",
    direction: "compression",
    heatDirection: "none",
  },
];

const CURZON_AHLBORN_STAGES: readonly CycleStage[] = [
  {
    name: "1 → 2  Finite-time hot isotherm",
    shortName: "Hot heat transfer",
    description:
      "Heat crosses a finite temperature gap from the hot reservoir into an internally reversible working gas.",
    heat: "Heat flows in",
    work: "Expansion: W < 0",
    direction: "expansion",
    heatDirection: "in",
  },
  {
    name: "2 → 3  Internal adiabatic expansion",
    shortName: "Adiabatic expansion",
    description:
      "The internally reversible working gas expands without heat transfer and cools between its isotherms.",
    heat: "Insulated: Q = 0",
    work: "Expansion: W < 0",
    direction: "expansion",
    heatDirection: "none",
  },
  {
    name: "3 → 4  Finite-time cold isotherm",
    shortName: "Cold heat transfer",
    description:
      "Heat crosses a finite temperature gap from the working gas to the cold reservoir.",
    heat: "Heat flows out",
    work: "Compression: W > 0",
    direction: "compression",
    heatDirection: "out",
  },
  {
    name: "4 → 1  Internal adiabatic compression",
    shortName: "Adiabatic compression",
    description:
      "The internally reversible working gas is compressed without heat transfer back to its hot isotherm.",
    heat: "Insulated: Q = 0",
    work: "Compression: W > 0",
    direction: "compression",
    heatDirection: "none",
  },
];

export type CarnotCycle = {
  model: CycleModel;
  inputs: CarnotInputs;
  points: CyclePoint[];
  states: CyclePoint[];
  stages: readonly CycleStage[];
  workingTemperatures: {
    hot: number;
    cold: number;
  };
  metrics: {
    adiabaticRatio: number;
    entropyChange: number;
    heatIn: number;
    heatOut: number;
    netWork: number;
    numericWork: number;
    efficiency: number;
  };
};

function buildRange(start: number, end: number, count: number, includeEnd: boolean) {
  const divisor = includeEnd ? count - 1 : count;
  return Array.from(
    { length: count },
    (_, index) => start + ((end - start) * index) / divisor,
  );
}

function validate(inputs: CarnotInputs) {
  for (const [name, value] of Object.entries(inputs)) {
    if (!Number.isFinite(value)) {
      throw new Error(`${name} must be a finite number.`);
    }
  }

  if (!(inputs.T_hot > inputs.T_cold && inputs.T_cold > 0)) {
    throw new Error("Require hot-reservoir temperature > cold-reservoir temperature > 0 K.");
  }
  if (inputs.V1_L <= 0) {
    throw new Error("Initial volume V₁ must be positive.");
  }
  if (inputs.iso_ratio <= 1) {
    throw new Error("Isothermal expansion ratio V₂/V₁ must be greater than 1.");
  }
  if (inputs.gamma <= 1) {
    throw new Error("Heat-capacity ratio γ must be greater than 1.");
  }
  if (inputs.n <= 0) {
    throw new Error("Gas amount must be positive.");
  }
}

function integrateWork(points: CyclePoint[]) {
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

/**
 * Internal isotherms for the symmetric-contact Curzon–Ahlborn maximum-power
 * model. The external temperatures in `inputs` remain reservoir temperatures.
 */
export function workingTemperaturesFor(
  model: CycleModel,
  inputs: Pick<CarnotInputs, "T_hot" | "T_cold">,
) {
  if (model === "carnot") {
    return { hot: inputs.T_hot, cold: inputs.T_cold };
  }

  const geometricMean = Math.sqrt(inputs.T_hot * inputs.T_cold);
  return {
    hot: 0.5 * (inputs.T_hot + geometricMean),
    cold: 0.5 * (inputs.T_cold + geometricMean),
  };
}

/** Build a reversible Carnot loop or the internal loop of the CA model. */
export function buildThermalCycle(
  model: CycleModel,
  inputs: CarnotInputs,
): CarnotCycle {
  validate(inputs);

  const { T_hot, T_cold, V1_L, iso_ratio, gamma, n } = inputs;
  const workingTemperatures = workingTemperaturesFor(model, inputs);
  const workingHot = workingTemperatures.hot;
  const workingCold = workingTemperatures.cold;
  const V1 = V1_L * 1e-3;
  const V2 = V1 * iso_ratio;
  const adiabaticRatio = (workingHot / workingCold) ** (1 / (gamma - 1));

  if (!Number.isFinite(adiabaticRatio) || adiabaticRatio <= 0) {
    throw new Error(
      "The derived adiabatic volume ratio is outside the numeric range. Use temperatures closer together or a larger γ.",
    );
  }

  const V3 = V2 * adiabaticRatio;
  const V4 = V1 * adiabaticRatio;
  if (![V1, V2, V3, V4].every(Number.isFinite)) {
    throw new Error(
      "The derived cylinder volumes are outside the numeric range. Use temperatures closer together or a larger γ.",
    );
  }

  const pointsPerProcess = 160;
  const V12 = buildRange(V1, V2, pointsPerProcess, false);
  const V23 = buildRange(V2, V3, pointsPerProcess, false);
  const V34 = buildRange(V3, V4, pointsPerProcess, false);
  const V41 = buildRange(V4, V1, pointsPerProcess, true);
  const entropyChange = n * GAS_CONSTANT * Math.log(iso_ratio);
  const points: CyclePoint[] = [];

  for (const volume of V12) {
    points.push({
      volume,
      pressure: (n * GAS_CONSTANT * workingHot) / volume,
      temperature: workingHot,
      entropy: n * GAS_CONSTANT * Math.log(volume / V1),
      stage: 0,
    });
  }
  for (const volume of V23) {
    const temperature = workingHot * (V2 / volume) ** (gamma - 1);
    points.push({
      volume,
      pressure: (n * GAS_CONSTANT * temperature) / volume,
      temperature,
      entropy: entropyChange,
      stage: 1,
    });
  }
  for (const volume of V34) {
    points.push({
      volume,
      pressure: (n * GAS_CONSTANT * workingCold) / volume,
      temperature: workingCold,
      entropy: entropyChange + n * GAS_CONSTANT * Math.log(volume / V3),
      stage: 2,
    });
  }
  for (const volume of V41) {
    const temperature = workingCold * (V4 / volume) ** (gamma - 1);
    points.push({
      volume,
      pressure: (n * GAS_CONSTANT * temperature) / volume,
      temperature,
      entropy: 0,
      stage: 3,
    });
  }

  const heatIn = n * GAS_CONSTANT * workingHot * Math.log(iso_ratio);
  const heatOut = n * GAS_CONSTANT * workingCold * Math.log(iso_ratio);
  const netWork = -(heatIn - heatOut);
  const stages = model === "carnot" ? CARNOT_STAGES : CURZON_AHLBORN_STAGES;

  return {
    model,
    inputs: { T_hot, T_cold, V1_L, iso_ratio, gamma, n },
    points,
    states: [
      points[0],
      points[pointsPerProcess],
      points[pointsPerProcess * 2],
      points[pointsPerProcess * 3],
    ],
    stages,
    workingTemperatures,
    metrics: {
      adiabaticRatio,
      entropyChange,
      heatIn,
      heatOut,
      netWork,
      numericWork: integrateWork(points),
      efficiency: -netWork / heatIn,
    },
  };
}

export function buildCarnotCycle(inputs: CarnotInputs) {
  return buildThermalCycle("carnot", inputs);
}

export function buildCurzonAhlbornCycle(inputs: CarnotInputs) {
  return buildThermalCycle("curzon-ahlborn", inputs);
}

export function cycleModelLabel(model: CycleModel) {
  return model === "carnot"
    ? "Reversible Carnot cycle"
    : "Curzon–Ahlborn endoreversible cycle";
}
