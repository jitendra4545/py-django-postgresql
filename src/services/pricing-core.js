import Decimal from 'decimal.js';

const money = (value) => new Decimal(value ?? 0);
const roundWhole = (value) => money(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

export const computeQuoteBreakdown = ({
  serviceCode,
  rateAmount,
  durationDays,
  options,
  optionSelections,
  taxes,
  rateIsTotal = false,
  oneWayCharge = 0,
  chauffeurExtraCost = 0,
  insuranceCost = 0,
}) => {
  const days = Math.max(Number(durationDays) || 1, 1);
  const baseRate = money(
    roundWhole(money(rateAmount).times(rateIsTotal || serviceCode === 'TRANSFER' ? 1 : days)),
  );
  let taxableOptions = money(0);
  let nonTaxableOptions = money(0);
  const optionLines = options.map((option) => {
    const selection = optionSelections.find((item) => Number(item.optionId) === Number(option.id));
    const quantity = Math.max(Number(selection?.quantity) || 1, 1);
    const basisMultiplier = Number(option.based_on) === 1 ? days : 1;
    // The existing public PHP booking flow charges rental_options.amount as a
    // configured amount, even when rate_type=2. Match that flow here.
    const amount = money(roundWhole(money(option.amount).times(quantity).times(basisMultiplier)));
    if (Number(option.taxable) === 1) taxableOptions = taxableOptions.plus(amount);
    else nonTaxableOptions = nonTaxableOptions.plus(amount);
    return {
      optionId: option.id,
      title: option.title,
      quantity,
      amount: amount.toNumber(),
      basedOn: option.based_on,
      rateType: option.rate_type,
      unitAmount: option.amount,
    };
  });
  const fees = money(roundWhole(oneWayCharge))
    .plus(roundWhole(chauffeurExtraCost))
    .plus(roundWhole(insuranceCost));
  const taxableBase = baseRate.plus(taxableOptions).plus(fees);
  const taxLines = taxes.map((tax) => ({
    taxId: tax.id,
    title: tax.title,
    ratePercent: Number(tax.amount),
    // The reservation system stores whole currency units for every cost line.
    amount: roundWhole(taxableBase.times(tax.amount).dividedBy(100)),
  }));
  const totalTax = taxLines.reduce((sum, item) => sum.plus(item.amount), money(0));
  const net = taxableBase.plus(nonTaxableOptions);
  const total = net.plus(totalTax);
  return {
    baseRate: baseRate.toNumber(),
    options: optionLines,
    taxableOptions: taxableOptions.toNumber(),
    nonTaxableOptions: nonTaxableOptions.toNumber(),
    oneWayCharge: roundWhole(oneWayCharge),
    chauffeurExtraCost: roundWhole(chauffeurExtraCost),
    insuranceCost: roundWhole(insuranceCost),
    netCost: net.toNumber(),
    taxes: taxLines,
    totalTax: totalTax.toNumber(),
    total: roundWhole(total),
  };
};
