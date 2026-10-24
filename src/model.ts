export type NodeKind = 'standard' | 'market';

export interface MarketConfig {
  goodName: string;
  currency: string;
  demandSlope: number;
  supplySlope: number;
  demandChokePrice: number;
  supplyQuantityAtZero: number;
  demandNodeId?: number;
  supplyNodeId?: number;
  priceNodeId?: number;
  quantityNodeId?: number;
}

export type MarketParameters = Pick<
  MarketConfig,
  'demandSlope' | 'supplySlope' | 'demandChokePrice' | 'supplyQuantityAtZero'
>;

export const defaultMarketParameters: MarketParameters = {
  demandSlope: 1,
  supplySlope: 1,
  demandChokePrice: 100,
  supplyQuantityAtZero: 0,
};

export interface Node {
  id: number;
  x: number;
  y: number;
  label: string;
  value: number;
  kind?: NodeKind;
  market?: MarketConfig;
}

export interface Edge {
  id: number;
  source: Node['id'];
  target: Node['id'];
  type: 'increment' | 'decrement';
}

export interface Graph {
  nodes: Node[];
  edges: Edge[];
}

export function isNode(el: any): el is Node {
  return (
    typeof el === 'object' &&
    el !== null &&
    typeof el.id === 'number' &&
    typeof el.x === 'number' &&
    typeof el.y === 'number' &&
    typeof el.label === 'string' &&
    typeof el.value === 'number'
  );
}

export function isEdge(el: any): el is Edge {
  return (
    typeof el === 'object' &&
    el !== null &&
    typeof el.source === 'number' &&
    typeof el.target === 'number' &&
    (el.type === 'increment' || el.type === 'decrement')
  );
}

export function createMarketNode(
  config: Partial<MarketConfig> & { id: number; x: number; y: number; label?: string },
): Node {
  return {
    id: config.id,
    x: config.x,
    y: config.y,
    label: config.label ?? 'Market',
    value: 0,
    kind: 'market',
    market: {
      goodName: config.goodName ?? 'goods',
      currency: config.currency ?? '$',
      demandSlope: config.demandSlope ?? defaultMarketParameters.demandSlope,
      supplySlope: config.supplySlope ?? defaultMarketParameters.supplySlope,
      demandChokePrice: config.demandChokePrice ?? defaultMarketParameters.demandChokePrice,
      supplyQuantityAtZero: config.supplyQuantityAtZero ?? defaultMarketParameters.supplyQuantityAtZero,
      demandNodeId: config.demandNodeId,
      supplyNodeId: config.supplyNodeId,
      priceNodeId: config.priceNodeId,
      quantityNodeId: config.quantityNodeId,
    },
  };
}

export function getNodeById(graph: Graph, id: number) {
  return graph.nodes.find((n) => n.id === id)!;
}

export interface MarketEquilibrium {
  price: number;
  quantity: number;
}

export function calculateMarketEquilibrium(graph: Graph, market: Node): MarketEquilibrium | undefined {
  const config = market.market;
  if (market.kind !== 'market' || !config) return undefined;

  const demandNode =
    config.demandNodeId === undefined ? undefined : graph.nodes.find((node) => node.id === config.demandNodeId);
  const supplyNode =
    config.supplyNodeId === undefined ? undefined : graph.nodes.find((node) => node.id === config.supplyNodeId);
  if ((config.demandNodeId !== undefined && !demandNode) || (config.supplyNodeId !== undefined && !supplyNode)) {
    return undefined;
  }

  const demandShift = demandNode?.value ?? 0;
  const supplyShift = supplyNode?.value ?? 0;
  const demandIntercept = Math.max(0, config.demandSlope * config.demandChokePrice + demandShift);
  const supplyIntercept = Math.max(0, config.supplyQuantityAtZero + supplyShift);
  const totalSlope = config.demandSlope + config.supplySlope;
  if (
    !Number.isFinite(demandShift) ||
    !Number.isFinite(supplyShift) ||
    !Number.isFinite(demandIntercept) ||
    !Number.isFinite(supplyIntercept) ||
    !Number.isFinite(totalSlope) ||
    !Number.isFinite(config.demandSlope) ||
    !Number.isFinite(config.supplySlope) ||
    !Number.isFinite(config.demandChokePrice) ||
    !Number.isFinite(config.supplyQuantityAtZero) ||
    config.demandSlope < 0 ||
    config.supplySlope < 0 ||
    config.demandChokePrice < 0 ||
    config.supplyQuantityAtZero < 0 ||
    totalSlope <= 0
  ) {
    return undefined;
  }

  const price = Math.max(0, (demandIntercept - supplyIntercept) / totalSlope);
  const demandAtPrice = demandIntercept - config.demandSlope * price;
  const supplyAtPrice = supplyIntercept + config.supplySlope * price;
  const quantity = Math.max(0, Math.min(demandAtPrice, supplyAtPrice));
  return { price, quantity };
}

export function downloadJson(graph: Graph) {
  const dataStr = JSON.stringify(graph, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'graph.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

export function buildGoodsMarketModel(): Graph {
  const goodsMarket = createMarketNode({
    id: 1,
    x: 0.3,
    y: 0.5,
    label: 'Goods market',
    goodName: 'goods',
    currency: '$',
    demandSlope: 1.25,
    supplySlope: 1,
    demandChokePrice: 100,
    supplyQuantityAtZero: 88,
    demandNodeId: 2,
    supplyNodeId: 3,
    priceNodeId: 4,
    quantityNodeId: 5,
  });

  const demandGoods = { id: 2, x: 0.49, y: 0.68, label: 'Demand goods', value: 0, kind: 'standard' as const };
  const supplyGoods = { id: 3, x: 0.12, y: 0.68, label: 'Supply goods', value: 0, kind: 'standard' as const };
  const price = { id: 4, x: 0.18, y: 0.18, label: 'Price', value: 100, kind: 'standard' as const };
  const GDP = { id: 5, x: 0.44, y: 0.18, label: 'GDP', value: 1000, kind: 'standard' as const };

  const materialsPrice = { id: 6, x: 0.16, y: 0.88, label: 'Material prices', value: 70, kind: 'standard' as const };
  const labor = { id: 7, x: 0.3, y: 0.92, label: 'Labor', value: 80, kind: 'standard' as const };
  const technology = { id: 8, x: 0.42, y: 0.92, label: 'Technology', value: 75, kind: 'standard' as const };
  const expectedIncomeAndProfits = {
    id: 9,
    x: 0.68,
    y: 0.92,
    label: 'Expected income / profits',
    value: 70,
    kind: 'standard' as const,
  };
  const privateInvestment = {
    id: 10,
    x: 0.84,
    y: 0.8,
    label: 'Private investment',
    value: 85,
    kind: 'standard' as const,
  };
  const interestRate = { id: 11, x: 0.9, y: 0.92, label: 'Interest rate', value: 60, kind: 'standard' as const };
  const moneySupply = { id: 12, x: 0.58, y: 0.9, label: 'Money supply', value: 90, kind: 'standard' as const };
  const governmentSpending = {
    id: 13,
    x: 0.7,
    y: 0.8,
    label: 'Government spending',
    value: 78,
    kind: 'standard' as const,
  };
  const taxes = { id: 14, x: 0.9, y: 0.72, label: 'Taxes', value: 62, kind: 'standard' as const };
  const exports = { id: 15, x: 0.54, y: 0.78, label: 'Exports', value: 72, kind: 'standard' as const };

  const laborMarket = createMarketNode({
    id: 16,
    x: 0.72,
    y: 0.5,
    label: 'Labor market',
    goodName: 'labor',
    currency: 'wages',
    demandSlope: 1.1,
    supplySlope: 0.05,
    demandChokePrice: 100,
    supplyQuantityAtZero: 82,
    demandNodeId: 17,
    supplyNodeId: 18,
    priceNodeId: 19,
    quantityNodeId: 7,
  });
  const laborDemand = { id: 17, x: 0.88, y: 0.68, label: 'Labor demand', value: 0, kind: 'standard' as const };
  const laborSupply = { id: 18, x: 0.56, y: 0.68, label: 'Labor supply', value: 0, kind: 'standard' as const };
  const realWages = { id: 19, x: 0.64, y: 0.18, label: 'Real wages', value: 95, kind: 'standard' as const };
  const population = { id: 20, x: 0.54, y: 0.9, label: 'Population', value: 84, kind: 'standard' as const };

  const loanableFundsMarket = createMarketNode({
    id: 21,
    x: 0.5,
    y: 0.24,
    label: 'Loanable funds market',
    goodName: 'loanable funds',
    currency: 'real interest',
    demandSlope: 1.2,
    supplySlope: 1.2,
    demandChokePrice: 100,
    supplyQuantityAtZero: 82,
    demandNodeId: 22,
    supplyNodeId: 23,
    priceNodeId: 25,
    quantityNodeId: 24,
  });
  const loanableFundsDemand = {
    id: 22,
    x: 0.62,
    y: 0.36,
    label: 'Loanable funds demand',
    value: 0,
    kind: 'standard' as const,
  };
  const loanableFundsSupply = {
    id: 23,
    x: 0.38,
    y: 0.36,
    label: 'Loanable funds supply',
    value: 0,
    kind: 'standard' as const,
  };
  const loanedFunds = { id: 24, x: 0.46, y: 0.12, label: 'Loaned funds', value: 90, kind: 'standard' as const };
  const realInterest = { id: 25, x: 0.54, y: 0.12, label: 'Real interest', value: 60, kind: 'standard' as const };
  const governmentSurplus = {
    id: 26,
    x: 0.08,
    y: 0.46,
    label: 'Government surplus',
    value: 70,
    kind: 'standard' as const,
  };
  const foreignBorrowing = {
    id: 27,
    x: 0.18,
    y: 0.46,
    label: 'Foreign borrowing',
    value: 68,
    kind: 'standard' as const,
  };
  const privateSavings = {
    id: 28,
    x: 0.3,
    y: 0.46,
    label: 'Private savings',
    value: 80,
    kind: 'standard' as const,
  };
  const wealth = { id: 29, x: 0.18, y: 0.64, label: 'Wealth', value: 74, kind: 'standard' as const };
  const income = { id: 31, x: 0.42, y: 0.64, label: 'Income', value: 78, kind: 'standard' as const };
  const foreignLendingOut = {
    id: 32,
    x: 0.68,
    y: 0.46,
    label: 'Foreign lending out',
    value: 66,
    kind: 'standard' as const,
  };
  const governmentDeficit = {
    id: 33,
    x: 0.82,
    y: 0.46,
    label: 'Government deficit',
    value: 72,
    kind: 'standard' as const,
  };
  const moneyMarket = createMarketNode({
    id: 34,
    x: 0.5,
    y: 0.76,
    label: 'Money market',
    goodName: 'physical money',
    currency: 'nominal interest rate',
    demandSlope: 1,
    supplySlope: 0,
    demandChokePrice: 100,
    supplyQuantityAtZero: 90,
    demandNodeId: 35,
    supplyNodeId: 36,
    priceNodeId: interestRate.id,
    quantityNodeId: moneySupply.id,
  });
  const moneyDemand = {
    id: 35,
    x: 0.68,
    y: 0.68,
    label: 'Demand for money',
    value: 0,
    kind: 'standard' as const,
  };
  const moneySupplyPolicy = {
    id: 36,
    x: 0.32,
    y: 0.68,
    label: 'Central bank money supply',
    value: 0,
    kind: 'standard' as const,
  };

  interestRate.label = 'Nominal interest rate';
  moneySupply.label = 'Physical money';

  return {
    nodes: [
      goodsMarket,
      demandGoods,
      supplyGoods,
      price,
      GDP,
      materialsPrice,
      labor,
      technology,
      expectedIncomeAndProfits,
      privateInvestment,
      interestRate,
      moneySupply,
      governmentSpending,
      taxes,
      exports,
      laborMarket,
      laborDemand,
      laborSupply,
      realWages,
      population,
      loanableFundsMarket,
      loanableFundsDemand,
      loanableFundsSupply,
      loanedFunds,
      realInterest,
      governmentSurplus,
      foreignBorrowing,
      privateSavings,
      wealth,
      income,
      foreignLendingOut,
      governmentDeficit,
      moneyMarket,
      moneyDemand,
      moneySupplyPolicy,
    ],
    edges: [
      { id: 1, source: demandGoods.id, target: goodsMarket.id, type: 'increment' },
      { id: 2, source: supplyGoods.id, target: goodsMarket.id, type: 'increment' },
      { id: 3, source: goodsMarket.id, target: price.id, type: 'increment' },
      { id: 4, source: goodsMarket.id, target: GDP.id, type: 'increment' },

      { id: 5, source: materialsPrice.id, target: supplyGoods.id, type: 'decrement' },
      { id: 6, source: labor.id, target: supplyGoods.id, type: 'increment' },
      { id: 7, source: technology.id, target: supplyGoods.id, type: 'increment' },

      { id: 8, source: expectedIncomeAndProfits.id, target: privateInvestment.id, type: 'increment' },
      { id: 9, source: privateInvestment.id, target: demandGoods.id, type: 'increment' },
      { id: 10, source: interestRate.id, target: privateInvestment.id, type: 'decrement' },
      { id: 11, source: moneySupply.id, target: demandGoods.id, type: 'increment' },
      { id: 12, source: governmentSpending.id, target: demandGoods.id, type: 'increment' },
      { id: 13, source: taxes.id, target: demandGoods.id, type: 'decrement' },
      { id: 14, source: exports.id, target: demandGoods.id, type: 'increment' },
      { id: 15, source: demandGoods.id, target: expectedIncomeAndProfits.id, type: 'increment' },
      { id: 16, source: technology.id, target: expectedIncomeAndProfits.id, type: 'increment' },

      { id: 17, source: demandGoods.id, target: laborDemand.id, type: 'increment' },
      { id: 18, source: laborDemand.id, target: laborMarket.id, type: 'increment' },
      { id: 19, source: laborSupply.id, target: laborMarket.id, type: 'increment' },
      { id: 20, source: population.id, target: laborSupply.id, type: 'increment' },
      { id: 21, source: realWages.id, target: laborSupply.id, type: 'increment' },
      { id: 22, source: taxes.id, target: realWages.id, type: 'decrement' },
      { id: 23, source: laborMarket.id, target: labor.id, type: 'increment' },
      { id: 24, source: laborMarket.id, target: realWages.id, type: 'increment' },
      { id: 25, source: labor.id, target: income.id, type: 'increment' },
      { id: 26, source: taxes.id, target: income.id, type: 'decrement' },
      { id: 27, source: wealth.id, target: privateSavings.id, type: 'increment' },
      { id: 28, source: expectedIncomeAndProfits.id, target: privateSavings.id, type: 'increment' },
      { id: 29, source: income.id, target: privateSavings.id, type: 'increment' },
      { id: 30, source: interestRate.id, target: privateSavings.id, type: 'increment' },
      { id: 31, source: governmentSpending.id, target: governmentDeficit.id, type: 'increment' },
      { id: 32, source: taxes.id, target: governmentDeficit.id, type: 'decrement' },
      { id: 33, source: governmentSpending.id, target: governmentSurplus.id, type: 'decrement' },
      { id: 34, source: taxes.id, target: governmentSurplus.id, type: 'increment' },
      { id: 35, source: exports.id, target: foreignBorrowing.id, type: 'increment' },
      { id: 36, source: exports.id, target: foreignLendingOut.id, type: 'increment' },
      { id: 37, source: governmentSurplus.id, target: loanableFundsSupply.id, type: 'increment' },
      { id: 38, source: foreignBorrowing.id, target: loanableFundsSupply.id, type: 'increment' },
      { id: 39, source: privateSavings.id, target: loanableFundsSupply.id, type: 'increment' },
      { id: 40, source: loanableFundsSupply.id, target: loanableFundsMarket.id, type: 'increment' },
      { id: 41, source: foreignLendingOut.id, target: loanableFundsDemand.id, type: 'increment' },
      { id: 42, source: governmentDeficit.id, target: loanableFundsDemand.id, type: 'increment' },
      { id: 43, source: privateInvestment.id, target: loanableFundsDemand.id, type: 'increment' },
      { id: 44, source: loanableFundsDemand.id, target: loanableFundsMarket.id, type: 'increment' },
      { id: 45, source: loanableFundsMarket.id, target: loanedFunds.id, type: 'increment' },
      { id: 46, source: loanableFundsMarket.id, target: realInterest.id, type: 'increment' },

      { id: 47, source: GDP.id, target: moneyDemand.id, type: 'increment' },
      { id: 48, source: interestRate.id, target: moneyDemand.id, type: 'decrement' },
      { id: 49, source: moneyDemand.id, target: moneyMarket.id, type: 'increment' },
      { id: 50, source: moneySupplyPolicy.id, target: moneyMarket.id, type: 'increment' },
      { id: 51, source: moneyMarket.id, target: interestRate.id, type: 'increment' },
      { id: 52, source: moneyMarket.id, target: moneySupply.id, type: 'increment' },
    ],
  };
}
