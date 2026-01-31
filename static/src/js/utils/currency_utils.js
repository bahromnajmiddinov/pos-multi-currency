/** @odoo-module */

import { _t } from "@web/core/l10n/translation";

/**
 * ============================================================
 * currency_utils.js — Pure, stateless utility functions
 * ============================================================
 */

/**
 * Convert an amount from one currency to another.
 * rates map: { [currencyId]: rateToBaseCurrency }
 *   meaning 1 base = rates[X] units of currency X.
 */
export function convertAmount(amount, sourceCurrencyId, targetCurrencyId, rates, baseCurrencyId) {
    if (sourceCurrencyId === targetCurrencyId) return amount;
    const sourceRate = sourceCurrencyId === baseCurrencyId ? 1.0 : (rates[sourceCurrencyId] || 1.0);
    const targetRate = targetCurrencyId === baseCurrencyId ? 1.0 : (rates[targetCurrencyId] || 1.0);
    return amount * (targetRate / sourceRate);
}

/**
 * Effective rate: 1 unit of orderCurrency = ? units of paymentCurrency.
 */
export function getEffectiveRate(orderCurrencyId, paymentCurrencyId, rates, baseCurrencyId) {
    if (orderCurrencyId === paymentCurrencyId) return 1.0;
    return convertAmount(1, orderCurrencyId, paymentCurrencyId, rates, baseCurrencyId);
}

/** Safe rounding. */
export function roundTo(value, decimals = 2) {
    const factor = Math.pow(10, decimals);
    return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** e.g. rounding=0.01 → 2 decimals */
export function decimalsFromRounding(rounding) {
    if (!rounding || rounding <= 0) return 2;
    return Math.max(0, Math.round(-Math.log10(rounding)));
}

/**
 * Format amount with currency symbol and correct decimals.
 */
export function formatMCAmount(amount, currency, showSymbol = true) {
    const decimals = decimalsFromRounding(currency?.rounding);
    const formatted = amount.toFixed(decimals);
    if (showSymbol && currency?.symbol) {
        return `${currency.symbol}\u00A0${formatted}`;
    }
    return formatted;
}

/**
 * Validate a manually-entered rate against market rate.
 * Returns { valid, message }.
 */
export function validateRate(manualRate, marketRate, maxDev = 0.5) {
    if (!manualRate || manualRate <= 0) {
        return { valid: false, message: _t("Rate must be a positive number.") };
    }
    if (marketRate && marketRate > 0) {
        const deviation = Math.abs(manualRate - marketRate) / marketRate;
        if (deviation > maxDev) {
            return {
                valid: false,
                message: _t(
                    "Rate deviates more than %s%% from market. Confirm to proceed.",
                    Math.round(maxDev * 100)
                ),
            };
        }
    }
    return { valid: true, message: null };
}
