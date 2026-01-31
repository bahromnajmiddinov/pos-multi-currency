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

    # ─── POS session data hooks ──────────────────────────────────────

    def _pos_config_data(self):
        """Extend config payload sent to the POS frontend on session open."""
        data = super()._pos_config_data()
        data["multi_currency_enabled"] = self.multi_currency_enabled
        data["multi_currency_allow_rate_edit"] = self.multi_currency_allow_rate_edit
        data["multi_currency_ids"] = (
            self.multi_currency_ids.ids if self.multi_currency_enabled else []
        )
        # Permission check: can the current user edit rates?
        can_edit = False
        if (
            self.multi_currency_allow_rate_edit
            and self.multi_currency_rate_edit_group_id
        ):
            can_edit = self.env.user.has_group(
                self.multi_currency_rate_edit_group_id.full_name
            )
        data["multi_currency_can_edit_rate"] = can_edit
        return data

    def get_pos_ui_info(self, params=None):
        """Ensure extra currency records are loaded into the POS session cache."""
        info = super().get_pos_ui_info(params)
        if self.multi_currency_enabled and self.multi_currency_ids:
            extra_ids = self.multi_currency_ids.ids
            loaded = info.get("data", {}).get("res.currency", [])
            loaded_ids = {r["id"] for r in loaded} if loaded else set()
            missing = [cid for cid in extra_ids if cid not in loaded_ids]
            if missing:
                extra = self.env["res.currency"].browse(missing).read()
                info.setdefault("data", {}).setdefault("res.currency", []).extend(extra)
        return info

    # ─── RPC methods called by the POS frontend ──────────────────────

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
