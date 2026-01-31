/** @odoo-module */

import { registry } from "@web/core/registry";
import { Base } from "@point_of_sale/app/models/related_models";
import { getEffectiveRate, roundTo, decimalsFromRounding } from "@pos_multi/js/utils/currency_utils";
const { DateTime } = luxon;

/**
 * Extends the base PosPayment model to carry multi-currency data.
 * Patched onto the existing pos.payment record via the registry.
 */
export class PosPaymentMultiCurrency extends Base {
    static pythonModel = "pos.payment";

    setup(vals) {
        super.setup(...arguments);
        this.payment_date = DateTime.now();
        this.amount = vals.amount || 0;
        this.ticket = vals.ticket || "";

        // --- Multi-currency fields ---
        this.payment_currency_id = vals.payment_currency_id || null;
        this.payment_currency_amount = vals.payment_currency_amount || 0;
        this.exchange_rate = vals.exchange_rate || 1.0;
        this.rate_manually_edited = vals.rate_manually_edited || false;
    }

    // ─── Original PosPayment API (preserved) ───────────────────────

    isSelected() {
        return this.pos_order_id?.uiState?.selected_paymentline_uuid === this.uuid;
    }

    setAmount(value) {
        this.pos_order_id.assertEditable();
        this.amount = this.pos_order_id.currency.round(parseFloat(value) || 0);
        // Keep payment_currency_amount in sync if currency is set
        this._syncCurrencyAmount();
    }

    getAmount() {
        return this.amount || 0;
    }

    getPaymentStatus() {
        return this.payment_status;
    }

    setPaymentStatus(value) {
        this.payment_status = value;
    }

    isDone() {
        return this.getPaymentStatus()
            ? this.getPaymentStatus() === "done" || this.getPaymentStatus() === "reversed"
            : true;
    }

    setCashierReceipt(value) {
        this.cashier_receipt = value;
    }

    setReceiptInfo(value) {
        this.ticket += value;
    }

    isElectronic() {
        return Boolean(this.getPaymentStatus());
    }

    async pay() {
        this.setPaymentStatus("waiting");
        return this.handlePaymentResponse(
            await this.payment_method_id.payment_terminal.sendPaymentRequest(this.uuid)
        );
    }

    handlePaymentResponse(isPaymentSuccessful) {
        if (isPaymentSuccessful) {
            this.setPaymentStatus("done");
            if (this.payment_method_id.payment_method_type !== "qr_code") {
                this.can_be_reversed = this.payment_method_id.payment_terminal.supports_reversals;
            }
        } else {
            this.setPaymentStatus("retry");
        }
        return isPaymentSuccessful;
    }

    updateRefundPaymentLine(refundedPaymentLine) {}

    // ─── Multi-currency API ─────────────────────────────────────────

    /**
     * Set the payment currency and compute the converted amount & rate.
     *
     * @param {Object}  currency      The res.currency record object
     * @param {Object}  rates         Rates map { [id]: rateToBase }
     * @param {number}  baseCurrencyId
     */
    setPaymentCurrency(currency, rates, baseCurrencyId) {
        if (!currency) return;
        this.payment_currency_id = currency;

        const orderCurrencyId = this.pos_order_id?.currency?.id;
        if (!orderCurrencyId) return;

        // Compute effective rate: 1 order-currency = ? payment-currency
        const rate = getEffectiveRate(orderCurrencyId, currency.id, rates, baseCurrencyId);
        this.exchange_rate = roundTo(rate, 6);
        this.rate_manually_edited = false;
        this._syncCurrencyAmount();
    }

    /**
     * Manually override the exchange rate (cashier adjustment).
     * @param {number} newRate  New rate (1 order unit = newRate payment units)
     */
    setManualRate(newRate) {
        if (newRate && newRate > 0) {
            this.exchange_rate = roundTo(newRate, 6);
            this.rate_manually_edited = true;
            this._syncCurrencyAmount();
        }
    }

    /**
     * Return the amount expressed in the payment currency.
     */
    getPaymentCurrencyAmount() {
        return this.payment_currency_amount || 0;
    }

    /**
     * Returns true if this line uses a foreign (non-order) currency.
     */
    isMultiCurrency() {
        if (!this.payment_currency_id) return false;
        const orderCurrencyId = this.pos_order_id?.currency?.id;
        return this.payment_currency_id.id !== orderCurrencyId;
    }

    /**
     * Keep payment_currency_amount in sync whenever amount or rate changes.
     * @private
     */
    _syncCurrencyAmount() {
        if (!this.payment_currency_id) {
            this.payment_currency_amount = this.amount;
            return;
        }
        const decimals = decimalsFromRounding(this.payment_currency_id.rounding);
        this.payment_currency_amount = roundTo(this.amount * this.exchange_rate, decimals);
    }
}

// Replace the default pos.payment model registration
registry.category("pos_available_models").add("pos.payment", PosPaymentMultiCurrency, {
    force: true,
});
