import Decimal from 'decimal.js';

const money = (value) => new Decimal(value ?? 0);
const round = (value) => money(value).toDecimalPlaces(2).toNumber();

export const computeQuoteBreakdown = ({
  serviceCode,
  rateAmount,
  durationDays,
  options,
  optionSelections,
  taxes,
}) => {
  const days = Math.max(Number(durationDays) || 1, 1);
  const baseRate = money(rateAmount).times(serviceCode === 'TRANSFER' ? 1 : days);
  let taxableOptions = money(0);
  let nonTaxableOptions = money(0);
  const optionLines = options.map((option) => {
    const selection = optionSelections.find((item) => Number(item.optionId) === Number(option.id));
    const quantity = Math.max(Number(selection?.quantity) || 1, 1);
    const basisMultiplier = Number(option.based_on) === 1 ? days : 1;
    const amount =
      Number(option.rate_type) === 2
        ? baseRate.times(option.amount).dividedBy(100).times(quantity)
        : money(option.amount).times(quantity).times(basisMultiplier);
    if (Number(option.taxable) === 1) taxableOptions = taxableOptions.plus(amount);
    else nonTaxableOptions = nonTaxableOptions.plus(amount);
    return { optionId: option.id, title: option.title, quantity, amount: round(amount) };
  });
  const taxableBase = baseRate.plus(taxableOptions);
  const taxLines = taxes.map((tax) => ({
    taxId: tax.id,
    title: tax.title,
    ratePercent: Number(tax.amount),
    amount: round(taxableBase.times(tax.amount).dividedBy(100)),
  }));
  const totalTax = taxLines.reduce((sum, item) => sum.plus(item.amount), money(0));
  const total = taxableBase.plus(nonTaxableOptions).plus(totalTax);
  return {
    baseRate: round(baseRate),
    options: optionLines,
    taxableOptions: round(taxableOptions),
    nonTaxableOptions: round(nonTaxableOptions),
    taxes: taxLines,
    totalTax: round(totalTax),
    total: round(total),
  };
};
