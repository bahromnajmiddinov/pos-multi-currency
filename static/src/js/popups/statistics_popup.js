/** @odoo-module */

import { Component, useState, onMounted } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { formatMCAmount } from "@pos_multi/js/utils/currency_utils";

/**
 * StatisticsPopup
 *
 * Shows a per-currency breakdown for the current POS session.
 * Data is fetched from the backend via the
 *   /pos/multi_currency/statistics
 * JSON-RPC endpoint defined in controllers/pos_controller.py.
 *
 * Props:
 *   - pos       {Object}   The PosStore service (passed explicitly so the
 *                           popup can run outside the normal POS component tree)
 *   - onClose   {Function} (optional) dismiss callback; falls back to
 *                           resolving the makeAwaitable promise.
 */
export class StatisticsPopup extends Component {
    static template = "point_of_sale.StatisticsPopup";
    static props = {
        pos: { type: Object, optional: true },
        onClose: { type: Function, optional: true },
    };

    setup() {
        this.pos = this.props.pos || usePos();
        this.state = useState({
            loading: true,
            rows: [],        // enriched row objects
        });

        onMounted(() => this.load());
    }

    // ─── data ───────────────────────────────────────────────────────

    async load() {
        this.state.loading = true;
        try {
            const sessionId = this.pos.session?.id;
            if (!sessionId) {
                this.state.rows = [];
                return;
            }

            // Call the backend controller
            const result = await this.pos.data.call(
                "pos.config",
                "get_multi_currency_statistics",
                [[this.pos.config.id], sessionId]
            );

            const stats = result?.statistics || [];

            // Enrich each row with formatted amounts
            this.state.rows = stats.map((row) => {
                const cur = this.pos.models["res.currency"]?.get?.(row.currency_id);
                return {
                    ...row,
                    totalForeign: formatMCAmount(row.total_amount, cur),
                    totalBase: formatMCAmount(
                        row.total_base_amount,
                        this.pos.multiCurrency?.baseCurrency
                    ),
                };
            });
        } catch (e) {
            console.warn("[pos_multi_currency] stats fetch failed:", e);
            this.state.rows = [];
        } finally {
            this.state.loading = false;
        }
    }

    // ─── computed totals ────────────────────────────────────────────

    get grandTotalBase() {
        const sum = this.state.rows.reduce((a, r) => a + (r.total_base_amount || 0), 0);
        return formatMCAmount(sum, this.pos.multiCurrency?.baseCurrency);
    }

    get grandTotalTxns() {
        return this.state.rows.reduce((a, r) => a + (r.transaction_count || 0), 0);
    }

    get grandTotalEdited() {
        return this.state.rows.reduce((a, r) => a + (r.manually_edited_count || 0), 0);
    }

    // ─── actions ────────────────────────────────────────────────────

    onClose() {
        if (this.props.onClose) {
            this.props.onClose();
        }
    }
}
