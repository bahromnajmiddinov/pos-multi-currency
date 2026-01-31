import { PosStore } from "@point_of_sale/app/services/pos_store";
import { patch } from "@web/core/utils/patch";

/**
 * PosMultiCurrencyService
 *
 * Manages multi-currency configuration, exchange rates, and session state.
 */
export class PosMultiCurrencyService {
    constructor(pos) {
        this.pos = pos;
        this._configEnabled = false;
        this._allowRateEdit = false;
        this._canEditRate = false;
        this._allowedCurrencyIds = [];
        this.rates = {};
        this.baseCurrencyId = null;
        this.sessionEnabled = true;
        this._initialized = false;
    }

    async init() {
        const config = this.pos.config;
        this._configEnabled = !!config.multi_currency_enabled;
        this._allowRateEdit = !!config.multi_currency_allow_rate_edit;
        this._canEditRate = !!config.multi_currency_can_edit_rate;
        this._allowedCurrencyIds = config.multi_currency_ids || [];
        this.baseCurrencyId = config.currency_id?.id || null;

        if (this._configEnabled) {
            await this.refreshRates();
        }
        this._initialized = true;
    }

    get isActive() {
        return this._configEnabled && this.sessionEnabled;
    }

    get isConfigured() {
        return this._configEnabled;
    }

    get canEditRate() {
        return this._canEditRate && this._allowRateEdit;
    }

    get allowedCurrencies() {
        const allCurrencies = this.pos.models["res.currency"]?.getAll?.() || [];
        const ids = new Set([this.baseCurrencyId, ...this._allowedCurrencyIds]);
        return allCurrencies.filter((c) => ids.has(c.id));
    }

    get baseCurrency() {
        return this.pos.models["res.currency"]?.get?.(this.baseCurrencyId) || null;
    }

    setSessionEnabled(enabled) {
        this.sessionEnabled = !!enabled;
    }

    async refreshRates() {
        try {
            const result = await this.pos.data.call(
                "pos.config",
                "get_multi_currency_rates",
                [[this.pos.config.id]]
            );
            if (result && result.rates) {
                this.rates = result.rates;
                this.baseCurrencyId = result.base_currency_id || this.baseCurrencyId;
            }
        } catch (e) {
            this._buildLocalRates();
        }
    }

    _buildLocalRates() {
        const currencies = this.pos.models["res.currency"]?.getAll?.() || [];
        for (const cur of currencies) {
            this.rates[cur.id] = cur.rate || 1.0;
        }
    }
}

// Patch PosStore to initialize the multi-currency service
patch(PosStore.prototype, {
    async setup() {
        await super.setup(...arguments);
        // Initialize multi-currency service
        this.multiCurrency = new PosMultiCurrencyService(this);
        await this.multiCurrency.init();
    },
});
