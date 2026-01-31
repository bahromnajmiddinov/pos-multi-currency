/** @odoo-module */
import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { roundTo } from "@pos_multi/js/utils/currency_utils";

/**
 * CurrencyRateInfo
 *
 * A compact horizontal bar that summarises the exchange rates currently
 * in use on the order's payment lines.  Only visible when multi-currency
 * is active AND at least one payment line uses a foreign currency.
 *
 * Props:
 *   - paymentLines  {Array}  The order's payment_ids
 */
export class CurrencyRateInfo extends Component {
    static template = "point_of_sale.CurrencyRateInfo";
    static props = {
        paymentLines: { type: Array, optional: true, default: () => [] },
    };

    setup() {
        this.pos = usePos();
        this.mc = this.pos.multiCurrency;
    }

    get isVisible() {
        return this.mc?.isActive && this.activeRates.length > 0;
    }

    get baseCurrencyName() {
        return this.mc?.baseCurrency?.name || "";
    }

    /**
     * Deduplicate currencies already in use on payment lines and
     * return an array of { id, name, rateFormatted, manuallyEdited }.
     */
    get activeRates() {
        const seen = new Set();
        const result = [];
        for (const line of this.props.paymentLines) {
            if (!line.isMultiCurrency?.()) continue;
            const cur = line.payment_currency_id;
            if (!cur || seen.has(cur.id)) continue;
            seen.add(cur.id);
            result.push({
                id: cur.id,
                name: cur.name,
                rateFormatted: `1 = ${roundTo(line.exchange_rate || 1, 4).toFixed(4)}`,
                manuallyEdited: !!line.rate_manually_edited,
            });
        }
        return result;
    }
}
