import Decimal from 'decimal.js';
import {BOOKING_POLICY} from './booking-policy.js';

const money = (value) => new Decimal(value ?? 0);
const roundWhole = (value) => money(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
const roundTwo = (value) => money(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

// The client website displays Swiss tax at the nearest CHF 0.05 (e.g.
// 412 * 8.1% = 33.372 -> 33.35), but shows checkout totals in whole CHF.
const taxLineAmount = (value, currency) => {
  const step=BOOKING_POLICY.taxRounding[currency]??BOOKING_POLICY.taxRounding.other;
  return money(value).div(step).toDecimalPlaces(0,Decimal.ROUND_HALF_UP).times(step).toDecimalPlaces(2).toNumber();
};

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
  optionBillingUnits = durationDays,
  discount = 0,
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
    const basisMultiplier = Number(option.based_on) === 1 ? Math.max(Number(optionBillingUnits) || 1, 1) : 1;
    // The existing public PHP booking flow charges rental_options.amount as a
    // configured amount, even when rate_type=2. Match that flow here.
    const amount = money(roundWhole(money(option.amount).times(quantity).times(basisMultiplier)));
    // Confirmed client policy: tax the base service fee only. Keep the public
    // response keys while classifying every selected extra as non-taxable.
    nonTaxableOptions = nonTaxableOptions.plus(amount);
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
  const taxableBase = Decimal.max(0, baseRate.minus(discount));
  // Allocate the rounded aggregate VAT by cumulative rate. The displayed lines
  // sum exactly to the same VAT the native admin calculates on its summed rate.
  let cumulativeRate = money(0), previousVat = money(0);
  const taxLines = taxes.map((tax) => {
    cumulativeRate = cumulativeRate.plus(tax.amount);
    const cumulativeVat = money(taxLineAmount(taxableBase.times(cumulativeRate).dividedBy(100), currency));
    const amount = cumulativeVat.minus(previousVat).toNumber();
    previousVat = cumulativeVat;
    return { taxId: tax.id, title: tax.title, ratePercent: Number(tax.amount), amount };
  });
  const totalTax = taxLines.reduce((sum, item) => sum.plus(item.amount), money(0));
  const net = baseRate.plus(taxableOptions).plus(nonTaxableOptions).plus(fees);
  const total = Decimal.max(0, net.minus(discount)).plus(totalTax);
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

export const discountQuoteLines = (lines, discount, currency) => {
  const taxable=Decimal.max(0,money(lines.baseRate).minus(discount));
  let rate=money(0),prior=money(0);
  const taxes=lines.taxes.map(tax=>{
    rate=rate.plus(tax.ratePercent);
    const vat=money(taxLineAmount(taxable.times(rate).div(100),currency));
    const amount=vat.minus(prior).toNumber();prior=vat;
    return {...tax,amount};
  });
  const total=Decimal.max(0,money(lines.netCost).minus(discount)).plus(prior);
  return {...lines,taxes,totalTax:roundTwo(prior),roundingAdjustment:roundTwo(money(roundWhole(total)).minus(total)),total:roundWhole(total)};
};
