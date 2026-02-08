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
        this.currencies = []; // Store currencies from RPC
        this._baseCurrency = null; // Store base currency from RPC
        this.rates = {};
        this.baseCurrencyId = null;
        this.sessionEnabled = true;
        this._initialized = false;
    }

    async init() {
        const config = this.pos.config;
        
        try {
            // Fetch multi-currency configuration via RPC
            const mcConfig = await this.pos.data.call(
                "pos.config",
                "get_multi_currency_config",
                [[config.id]]
            );
            
            console.log("Multi-currency config from RPC:", mcConfig);
            
            this._configEnabled = mcConfig.enabled;
            this._allowRateEdit = mcConfig.allow_rate_edit;
            this._canEditRate = mcConfig.can_edit_rate;
            
            // Store currencies from RPC response
            this.currencies = mcConfig.currencies || [];
            this._baseCurrency = mcConfig.base_currency;
            this.baseCurrencyId = this._baseCurrency?.id || null;
            
            // Extract allowed currency IDs
            this._allowedCurrencyIds = this.currencies.map(c => c.id);
            
            // Build initial rates from currencies
            this.rates = {};
            this.currencies.forEach(curr => {
                this.rates[curr.id] = curr.rate || 1.0;
            });
            
        } catch (error) {
            console.error("Failed to load multi-currency config:", error);
            this._configEnabled = false;
            this._allowedCurrencyIds = [];
            this.currencies = [];
        }

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
        // Return currencies from our stored data instead of trying to fetch from pos.models
        return this.currencies || [];
    }

    get baseCurrency() {
        // Return base currency from our stored data
        return this._baseCurrency || null;
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
                console.log("Refreshed rates:", this.rates);
            }
        } catch (e) {
            console.error("Failed to refresh rates:", e);
            this._buildLocalRates();
        }
    }

    _buildLocalRates() {
        // Use our stored currencies instead of pos.models
        this.rates = {};
        this.currencies.forEach(curr => {
            this.rates[curr.id] = curr.rate || 1.0;
        });
        console.log("Built local rates:", this.rates);
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