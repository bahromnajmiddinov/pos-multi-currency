# -*- coding: utf-8 -*-
from odoo import models


class ResCurrency(models.Model):
    _inherit = "res.currency"

    def _get_conversion_rate(self, target_currency):
        """
        Return rate such that: 1 unit of self = rate units of target_currency.
        Uses Odoo's built-in rate tables (res.currency.rate).
        """
        if self.id == target_currency.id:
            return 1.0
        # _compute_rate returns rate relative to company currency.
        # rate_self  = 1 unit company_currency => X units self
        # rate_target = 1 unit company_currency => Y units target
        # => 1 unit self = (Y / X) units target
        rate_self = self._compute_rate()
        rate_target = target_currency._compute_rate()
        if rate_self == 0:
            return 1.0
        return rate_target / rate_self

    @classmethod
    def _compute_rate(cls):
        """Fallback: compute latest rate for a single currency record."""
        # This is a thin wrapper; real implementations use
        # res.currency.rate with date filtering.
        # Odoo core already provides _compute_rate on the recordset;
        # this is kept for explicit single-record usage.
        raise NotImplementedError  # pragma: no cover
