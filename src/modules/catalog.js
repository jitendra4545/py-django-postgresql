import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../common/auth.js';
import { asyncHandler, ok, validate } from '../common/http.js';
import { LegacyServiceType } from '../common/legacy.js';
import { env } from '../config/env.js';
import { one, rows } from '../db/pool.js';
import { badRequest, notFound } from '../common/errors.js';
import { cacheGet, cacheSet } from '../db/redis.js';
function rentTypeForLegacyPrice(serviceTypeId) {
    if (serviceTypeId === LegacyServiceType.CAR_RENTAL)
        return 3; // price table comment: 3=Rent a car
    if (serviceTypeId === LegacyServiceType.TRANSFER)
        return 4; // price table comment: 4=Transfer
    return 1; // Limousine / car with driver
}
function optionRentType(serviceTypeId) {
    if (serviceTypeId === LegacyServiceType.CAR_RENTAL)
        return 2;
    if (serviceTypeId === LegacyServiceType.TRANSFER)
        return 3;
    return 1;
}
export async function availableVehicles(input, executor) {
    if (input.dropoffDate < input.pickupDate)
        throw badRequest('INVALID_DATE_RANGE', 'Drop-off date cannot be before pickup date');
    const data = await rows(`SELECT v.id,v.vehicle_class_id,v.title,v.model,v.year,v.thumbnail,v.current_location,
            vc.title AS vehicle_class_title,vc.image,vc.daily_rate,vc.weekly_rate,vc.deposit_amount,
            vc.half_insurance_amount,vc.full_insurance_amount,vc.half_insurance_text,vc.full_insurance_text
       FROM vehicles v
       JOIN vehicle_classes vc ON vc.id=v.vehicle_class_id AND vc.deleted_at IS NULL AND vc.status=1
      WHERE v.deleted_at IS NULL
        AND v.status=1
        AND v.online_booking_status=1
        AND (
          EXISTS (SELECT 1 FROM vehicle_service_types vst WHERE vst.vehicle_id=v.id AND vst.service_type=?)
          OR JSON_CONTAINS(CASE WHEN JSON_VALID(v.service_type) THEN v.service_type ELSE JSON_ARRAY() END, JSON_ARRAY(?))
          OR v.service_type LIKE ?
        )
        AND NOT EXISTS (
          SELECT 1 FROM vehicle_reserved_dates rd
           WHERE rd.vehicle_id=v.id AND rd.reserved_date BETWEEN ? AND ?
        )
        AND NOT EXISTS (
          SELECT 1 FROM vehicle_blocks vb
           WHERE vb.vehicle_id=v.id AND NOT (vb.end_date < ? OR vb.start_date > ?)
        )
      ORDER BY vc.title,v.title`, [input.serviceTypeId, input.serviceTypeId, `%${input.serviceTypeId}%`, input.pickupDate, input.dropoffDate, input.pickupDate, input.dropoffDate], executor);
    return data;
}
function daysInclusive(from, to) {
    const a = new Date(`${from}T00:00:00Z`).getTime();
    const b = new Date(`${to}T00:00:00Z`).getTime();
    return Math.max(1, Math.floor((b - a) / 86400_000) + 1);
}
export async function calculateQuote(input, executor) {
    const vehicle = await one(`SELECT v.id,v.vehicle_class_id,v.title,v.model,v.year,v.thumbnail,v.current_location,
            vc.title AS vehicle_class_title,vc.image,vc.daily_rate,vc.weekly_rate,vc.deposit_amount,
            vc.half_insurance_amount,vc.full_insurance_amount,vc.half_insurance_text,vc.full_insurance_text
       FROM vehicles v JOIN vehicle_classes vc ON vc.id=v.vehicle_class_id
      WHERE v.id=? AND v.deleted_at IS NULL AND vc.deleted_at IS NULL`, [input.vehicleId], executor);
    if (!vehicle)
        throw notFound('Vehicle');
    const days = daysInclusive(input.pickupDate, input.dropoffDate);
    const rentType = rentTypeForLegacyPrice(input.serviceTypeId);
    const legacyRate = await one(`SELECT pr.amount
       FROM vehicle_class_price_rates pr
      WHERE pr.vehicle_class_id=? AND pr.rent_type=? AND pr.status=1
      ORDER BY (pr.country_id=? ) DESC, pr.id DESC LIMIT 1`, [vehicle.vehicle_class_id, rentType, input.pickupCountryId ?? env.DEFAULT_COUNTRY_ID], executor);
    let baseRate;
    if (legacyRate?.amount != null) {
        baseRate = Number(legacyRate.amount) * (input.serviceTypeId === LegacyServiceType.CAR_RENTAL ? days : 1);
    }
    else if (input.serviceTypeId === LegacyServiceType.CAR_RENTAL) {
        const weeks = Math.floor(days / 7);
        const remainingDays = days % 7;
        baseRate = weeks * Number(vehicle.weekly_rate || 0) + remainingDays * Number(vehicle.daily_rate || 0);
        if (baseRate === 0)
            baseRate = Number(vehicle.daily_rate || 0) * days;
    }
    else {
        baseRate = Number(vehicle.daily_rate || 0);
    }
    const optionIds = [...new Set(input.optionIds ?? [])];
    const optionRows = optionIds.length
        ? await rows(`SELECT id,title,based_on,rate_type,amount FROM rental_options
         WHERE id IN (${optionIds.map(() => '?').join(',')}) AND status=1 AND deleted_at IS NULL AND rent_type=?`, [...optionIds, optionRentType(input.serviceTypeId)], executor)
        : [];
    const options = optionRows.map((o) => {
        const quantity = o.based_on === 1 ? days : 1;
        const total = o.rate_type === 2 ? baseRate * (Number(o.amount) / 100) * quantity : Number(o.amount) * quantity;
        return { id: o.id, title: o.title, quantity, unitAmount: Number(o.amount), rateType: o.rate_type, basedOn: o.based_on, total };
    });
    const optionalCost = options.reduce((sum, x) => sum + x.total, 0);
    let insuranceCost = 0;
    let insuranceText = null;
    if (input.insurance === 'HALF') {
        insuranceCost = Number(vehicle.half_insurance_amount ?? 0) * days;
        insuranceText = vehicle.half_insurance_text;
    }
    else if (input.insurance === 'FULL') {
        insuranceCost = Number(vehicle.full_insurance_amount ?? 0) * days;
        insuranceText = vehicle.full_insurance_text;
    }
    const surcharges = await rows('SELECT id,title,amount FROM tax_surecharges WHERE country_id=? AND service_type=? AND status=1 AND deleted_at IS NULL', [input.pickupCountryId ?? env.DEFAULT_COUNTRY_ID, input.serviceTypeId], executor);
    const totalTax = surcharges.reduce((sum, x) => sum + Number(x.amount), 0);
    const subtotalBeforeDiscount = baseRate + optionalCost + insuranceCost;
    let coupon = null;
    let discount = 0;
    if (input.couponCode) {
        const row = await one(`SELECT id,coupon_code,amount,deduction_type FROM discount_coupons
        WHERE LOWER(coupon_code)=LOWER(?) AND status=1 AND deleted_at IS NULL
          AND (start_date IS NULL OR start_date<=CURDATE()) AND (end_date IS NULL OR end_date>=CURDATE())
          AND (max_use IS NULL OR use_at IS NULL OR use_at<max_use)
        ORDER BY id DESC LIMIT 1`, [input.couponCode], executor);
        if (!row)
            throw badRequest('INVALID_COUPON', 'Coupon is invalid, inactive, expired, or exhausted');
        coupon = { id: row.id, code: row.coupon_code, amount: Number(row.amount), deductionType: row.deduction_type };
        discount = row.deduction_type === 2 ? subtotalBeforeDiscount * (Number(row.amount) / 100) : Number(row.amount);
        discount = Math.min(subtotalBeforeDiscount, Math.max(0, discount));
    }
    const netCost = Math.max(0, subtotalBeforeDiscount - discount);
    const totalAmount = netCost + totalTax;
    return {
        currency: env.DEFAULT_CURRENCY,
        days,
        vehicle: {
            id: vehicle.id,
            title: vehicle.title,
            classId: vehicle.vehicle_class_id,
            classTitle: vehicle.vehicle_class_title,
            image: vehicle.thumbnail ?? vehicle.image,
            depositAmount: Number(vehicle.deposit_amount ?? 0)
        },
        breakdown: {
            baseRate,
            optionalCost,
            insuranceCost,
            discount,
            totalTax,
            netCost,
            totalAmount
        },
        options,
        insurance: { type: input.insurance ?? 'NONE', text: insuranceText, amount: insuranceCost },
        coupon,
        surcharges: surcharges.map((x) => ({ id: x.id, title: x.title, amount: Number(x.amount) })),
        pricingNote: 'Compatibility pricing uses legacy active rate tables when available, then legacy vehicle-class daily/weekly rates. Exact client pricing/cancellation/deposit rules remain configurable.'
    };
}
export const catalogRouter = Router();
catalogRouter.use(requireAuth);
catalogRouter.get('/services', asyncHandler(async (_req, res) => {
    const cacheKey = 'catalog:services:v1';
    const cached = await cacheGet(cacheKey);
    if (cached)
        return ok(res, cached);
    const legacyServices = await rows('SELECT id,title,slug,image,description_en,description_de,description_fr FROM services ORDER BY id');
    const data = {
        mobileCategories: [
            { code: 'CHAUFFEUR', title: 'Chauffeur Service', serviceTypeId: LegacyServiceType.CHAUFFEUR, variants: [{ code: 'STANDARD', serviceTypeId: LegacyServiceType.CHAUFFEUR }, { code: 'TRANSFER', serviceTypeId: LegacyServiceType.TRANSFER }] },
            { code: 'CAR_RENTAL', title: 'Car Rental', serviceTypeId: LegacyServiceType.CAR_RENTAL }
        ],
        legacyServices
    };
    await cacheSet(cacheKey, data, 300);
    return ok(res, data);
}));
catalogRouter.get('/vehicles/available', asyncHandler(async (req, res) => {
    const q = validate(z.object({
        serviceTypeId: z.coerce.number().int(),
        pickupDate: z.string().date(),
        dropoffDate: z.string().date(),
        passengers: z.coerce.number().int().positive().optional()
    }), req.query);
    return ok(res, await availableVehicles(q));
}));
catalogRouter.get('/options', asyncHandler(async (req, res) => {
    const q = validate(z.object({ serviceTypeId: z.coerce.number().int() }), req.query);
    const data = await rows('SELECT id,title,description,based_on,rate_type,amount,taxable,rent_type FROM rental_options WHERE status=1 AND show_on_frontend=1 AND deleted_at IS NULL AND rent_type=? ORDER BY id', [optionRentType(q.serviceTypeId)]);
    return ok(res, data);
}));
catalogRouter.get('/vehicles/:vehicleId/insurance', asyncHandler(async (req, res) => {
    const vehicleId = Number(req.params.vehicleId);
    const row = await one(`SELECT v.id,vc.id AS vehicle_class_id,vc.half_insurance_text,vc.half_insurance_amount,
            vc.full_insurance_text,vc.full_insurance_amount,vc.deposit_amount
       FROM vehicles v JOIN vehicle_classes vc ON vc.id=v.vehicle_class_id WHERE v.id=?`, [vehicleId]);
    if (!row)
        throw notFound('Vehicle');
    return ok(res, row);
}));
catalogRouter.post('/quotes', asyncHandler(async (req, res) => {
    const body = validate(z.object({
        serviceTypeId: z.number().int(), vehicleId: z.number().int().positive(), pickupDate: z.string().date(), dropoffDate: z.string().date(),
        pickupCountryId: z.number().int().positive().optional(), approximateDistance: z.number().nonnegative().optional(),
        optionIds: z.array(z.number().int().positive()).optional(), insurance: z.enum(['NONE', 'HALF', 'FULL']).optional(), couponCode: z.string().max(191).optional()
    }), req.body);
    return ok(res, await calculateQuote(body));
}));
