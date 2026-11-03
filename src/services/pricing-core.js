import Decimal from 'decimal.js';

const money = (value) => new Decimal(value ?? 0);
const roundWhole = (value) => money(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
const roundTwo = (value) => money(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

// The client website displays Swiss tax at the nearest CHF 0.05 (e.g.
// 412 * 8.1% = 33.372 -> 33.35), but shows checkout totals in whole CHF.
const taxLineAmount = (value, currency) =>
  currency === 'CHF'
    ? money(value)
        .dividedBy('0.05')
        .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
        .times('0.05')
        .toDecimalPlaces(2)
        .toNumber()
    : roundWhole(value);

export const computeQuoteBreakdown = ({
  serviceCode,
  rateAmount,
  durationDays,
  options,
  optionSelections,
  taxes,
  currency = 'EUR',
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
    amount: taxLineAmount(taxableBase.times(tax.amount).dividedBy(100), currency),
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
    totalTax: roundTwo(totalTax),
    // CHF tax is displayed at 0.05 precision, but the website charges a
    // whole-franc final amount. Make that rounding difference explicit.
    roundingAdjustment: roundTwo(money(roundWhole(total)).minus(total)),
    total: roundWhole(total),
  };
};
