export const GAS_CONSTANT = 8.314462618;

export type CarnotInputs = {
  T_hot: number;
  T_cold: number;
  V1_L: number;
  iso_ratio: number;
  gamma: number;
  n: number;
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
};

export type CarnotCycle = {
  inputs: CarnotInputs;
  points: CyclePoint[];
  states: CyclePoint[];
  stages: CycleStage[];
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

export const DEFAULT_INPUTS: CarnotInputs = {
  T_hot: 650,
  T_cold: 450,
  V1_L: 10,
  iso_ratio: 1.7,
  gamma: 1.4,
  n: 1,
};

export const CARNOT_STAGES: CycleStage[] = [
  {
    name: "1 → 2  Isothermal expansion",
    shortName: "Hot isotherm",
    description:
      "Heat enters from the hot reservoir while the gas expands at constant temperature.",
    heat: "Heat flows in",
    work: "Expansion: W < 0",
  },
  {
    name: "2 → 3  Reversible adiabatic expansion",
    shortName: "Adiabatic expansion",
    description:
      "The boundary is insulated, so Q = 0 and expansion cools the working gas.",
    heat: "Insulated: Q = 0",
    work: "Expansion: W < 0",
  },
  {
    name: "3 → 4  Isothermal compression",
    shortName: "Cold isotherm",
    description:
      "Heat leaves to the cold reservoir while compression holds the gas at constant temperature.",
    heat: "Heat flows out",
    work: "Compression: W > 0",
  },
  {
    name: "4 → 1  Reversible adiabatic compression",
    shortName: "Adiabatic compression",
    description:
      "The boundary is insulated, so Q = 0 and compression raises the gas temperature.",
    heat: "Insulated: Q = 0",
    work: "Compression: W > 0",
  },
];

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
    throw new Error("Require hot temperature > cold temperature > 0.");
  }
  if (inputs.V1_L <= 0) {
    throw new Error("Initial volume V1 must be positive.");
  }
  if (inputs.iso_ratio <= 1) {
    throw new Error("Expansion ratio V2/V1 must be greater than 1.");
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

export function buildCarnotCycle(inputs: CarnotInputs): CarnotCycle {
  validate(inputs);

  const { T_hot, T_cold, V1_L, iso_ratio, gamma, n } = inputs;
  const V1 = V1_L * 1e-3;
  const V2 = V1 * iso_ratio;
  const adiabaticRatio = (T_hot / T_cold) ** (1 / (gamma - 1));

  if (!Number.isFinite(adiabaticRatio) || adiabaticRatio > 30) {
    const displayRatio = Number.isFinite(adiabaticRatio)
      ? adiabaticRatio.toFixed(1)
      : "too large";
    throw new Error(
      `Adiabatic volume ratio = ${displayRatio}, which is too large for this visualizer. Use closer temperatures or a larger γ.`,
    );
  }

  const V3 = V2 * adiabaticRatio;
  const V4 = V1 * adiabaticRatio;
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
      pressure: (n * GAS_CONSTANT * T_hot) / volume,
      temperature: T_hot,
      entropy: n * GAS_CONSTANT * Math.log(volume / V1),
      stage: 0,
    });
  }
  for (const volume of V23) {
    const temperature = T_hot * (V2 / volume) ** (gamma - 1);
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
      pressure: (n * GAS_CONSTANT * T_cold) / volume,
      temperature: T_cold,
      entropy: entropyChange + n * GAS_CONSTANT * Math.log(volume / V3),
      stage: 2,
    });
  }
  for (const volume of V41) {
    const temperature = T_cold * (V4 / volume) ** (gamma - 1);
    points.push({
      volume,
      pressure: (n * GAS_CONSTANT * temperature) / volume,
      temperature,
      entropy: 0,
      stage: 3,
    });
  }

  const heatIn = n * GAS_CONSTANT * T_hot * Math.log(iso_ratio);
  const heatOut = n * GAS_CONSTANT * T_cold * Math.log(iso_ratio);
  const netWork = -(heatIn - heatOut);

  return {
    inputs,
    points,
    states: [
      points[0],
      points[pointsPerProcess],
      points[pointsPerProcess * 2],
      points[pointsPerProcess * 3],
    ],
    stages: CARNOT_STAGES,
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
