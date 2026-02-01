# -*- coding: utf-8 -*-
from odoo import models, fields, api
from odoo.exceptions import ValidationError


class PosConfig(models.Model):
    _inherit = "pos.config"

    # ─── Multi-currency configuration fields ────────────────────────

    multi_currency_enabled = fields.Boolean(
        string="Enable Multi Currency",
        default=False,
        help="Allow accepting payments in multiple currencies in this POS.",
    )
    multi_currency_ids = fields.Many2many(
        "res.currency",
        string="Allowed Currencies",
        help="Currencies available for payment selection in POS.",
    )
    multi_currency_allow_rate_edit = fields.Boolean(
        string="Allow Rate Editing",
        default=False,
        help="If enabled, users with permission can manually adjust the exchange rate at payment time.",
    )
    multi_currency_rate_edit_group_id = fields.Many2one(
        "res.groups",
        string="Rate Edit Security Group",
        default=lambda self: self.env.ref("base.group_user", raise_if_not_found=False),
        help="Only users in this group can edit exchange rates.",
    )

    # ─── Validation ──────────────────────────────────────────────────

    @api.constrains("multi_currency_enabled", "multi_currency_ids")
    def _check_multi_currency_config(self):
        for rec in self:
            if rec.multi_currency_enabled and not rec.multi_currency_ids:
                raise ValidationError(
                    "At least one additional currency must be selected "
                    "when multi currency is enabled."
                )

    # ─── Load currencies into POS ────────────────────────────────────

    def _get_pos_base_models_to_load(self):
        """
        Odoo 19+ method to specify which models to load.
        This ensures res.currency is loaded.
        """
        models = super()._get_pos_base_models_to_load()
        # Make sure res.currency is in the list
        if "res.currency" not in models:
            models.append("res.currency")
        return models

    def _get_pos_res_currency_domain(self):
        """
        Define which currency records to load into POS.
        Called by Odoo's data loading system.
        """
        # Load the company currency + all configured multi-currencies
        domain = [("id", "=", self.currency_id.id)]
        
        if self.multi_currency_enabled and self.multi_currency_ids:
            # Add all configured currencies
            domain = ["|", ("id", "in", self.multi_currency_ids.ids)] + domain
        
        return domain

    def _get_pos_res_currency_fields(self):
        """
        Define which fields to load for res.currency records.
        """
        return [
            "name",
            "symbol",
            "rounding",
            "rate",
            "active",
            "decimal_places",
            "position",
        ]

    # ─── POS session data hooks ──────────────────────────────────────
    @api.model
    def _load_pos_data_read(self, records, config):
        """
        Override to add multi-currency configuration to POS config data.
        """
        read_records = super()._load_pos_data_read(records, config)
        
        if not read_records:
            return read_records
        
        # Add multi-currency configuration to the first record (which is this config)
        record = read_records[0]
        
        # Add multi-currency config - use 'config' not 'self'
        record['multi_currency_enabled'] = config.multi_currency_enabled
        record['multi_currency_allow_rate_edit'] = config.multi_currency_allow_rate_edit
        # Use mapped('id') to ensure proper ID list serialization
        record['multi_currency_ids'] = config.multi_currency_ids.mapped('id') if config.multi_currency_enabled else []
        
        # Permission check: can the current user edit rates?
        can_edit = False
        if config.multi_currency_allow_rate_edit and config.multi_currency_rate_edit_group_id:
            can_edit = self.env.user.has_group(
                config.multi_currency_rate_edit_group_id.full_name
            )
        record['multi_currency_can_edit_rate'] = can_edit
        
        return read_records

    # ─── RPC methods called by the POS frontend ──────────────────────
    
    def get_multi_currency_config(self):
        """
        Return multi-currency configuration and available currencies for this POS.
        Called by the POS frontend on initialization.
        
        Returns:
            dict: {
                "enabled": bool,
                "allow_rate_edit": bool,
                "can_edit_rate": bool,
                "base_currency": {id, name, symbol, ...},
                "currencies": [{id, name, symbol, rate, ...}]
            }
        """
        self.ensure_one()
        
        result = {
            "enabled": self.multi_currency_enabled,
            "allow_rate_edit": self.multi_currency_allow_rate_edit,
            "can_edit_rate": False,
            "base_currency": None,
            "currencies": []
        }
        
        # Check if user can edit rates
        if self.multi_currency_allow_rate_edit and self.multi_currency_rate_edit_group_id:
            result["can_edit_rate"] = self.env.user.has_group(
                self.multi_currency_rate_edit_group_id.full_name
            )
        
        # Get base currency
        base_currency = self.currency_id
        if base_currency:
            result["base_currency"] = {
                "id": base_currency.id,
                "name": base_currency.name,
                "symbol": base_currency.symbol,
                "rounding": base_currency.rounding,
                "rate": base_currency.rate,
                "decimal_places": base_currency.decimal_places,
                "position": base_currency.position,
            }
        
        # Get all configured currencies
        if self.multi_currency_enabled and self.multi_currency_ids:
            currency_ids = self.multi_currency_ids | base_currency
            for currency in currency_ids:
                result["currencies"].append({
                    "id": currency.id,
                    "name": currency.name,
                    "symbol": currency.symbol,
                    "rounding": currency.rounding,
                    "rate": currency.rate,
                    "decimal_places": currency.decimal_places,
                    "position": currency.position,
                })
        elif base_currency:
            # Only base currency
            result["currencies"].append(result["base_currency"])
        
        return result

    def get_multi_currency_rates(self):
        """
        Return live exchange rates for all active currencies relative to
        the company currency.  Called once on session open; can be polled.

        Returns:
            dict: {"rates": {currency_id: rate}, "base_currency_id": int}
                  rate means: 1 unit of company currency = rate units of currency.
        """
        base = self.env.company.currency_id
        currencies = self.env["res.currency"].search([("active", "=", True)])
        rates = {}
        for cur in currencies:
            rates[cur.id] = 1.0 if cur.id == base.id else (cur.rate or 1.0)
        return {"rates": rates, "base_currency_id": base.id}

    def get_multi_currency_statistics(self, session_id):
        """
        Return per-currency payment statistics for the given session.

        Args:
            session_id (int): The pos.session ID.

        Returns:
            dict: {"statistics": [...], "session_id": int}
        """
        if not session_id:
            return {"statistics": [], "session_id": False}

        session = self.env["pos.session"].browse(session_id)
        if not session.exists():
            return {"statistics": [], "session_id": session_id}

        payments = self.env["pos.payment"].search(
            [
                ("session_id", "=", session_id),
                ("payment_currency_id", "!=", False),
            ]
        )

        # Aggregate
        stats = {}  # keyed by currency id
        for p in payments:
            cid = p.payment_currency_id.id
            if cid not in stats:
                stats[cid] = {
                    "currency_id": cid,
                    "currency_name": p.payment_currency_id.name,
                    "total_amount": 0.0,
                    "total_base_amount": 0.0,
                    "transaction_count": 0,
                    "manually_edited_count": 0,
                }
            stats[cid]["total_amount"] += p.payment_currency_amount
            stats[cid]["total_base_amount"] += p.amount
            stats[cid]["transaction_count"] += 1
            if p.rate_manually_edited:
                stats[cid]["manually_edited_count"] += 1

        return {"statistics": list(stats.values()), "session_id": session_id}
    