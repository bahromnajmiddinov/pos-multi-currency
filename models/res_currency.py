# -*- coding: utf-8 -*-
from odoo import models, fields, api


class ResCurrency(models.Model):
    _inherit = "res.currency"

    @api.model
    def _get_conversion_rate(self, from_currency, to_currency, company, date):
        """
        Return conversion rate from one currency to another.
        This is a MODEL method (not instance method) to match Odoo's standard signature.
        
        Called by pos_sale and other modules like:
        self.env['res.currency']._get_conversion_rate(from_cur, to_cur, company, date)
        
        Args:
            from_currency: res.currency record to convert from
            to_currency: res.currency record to convert to
            company: res.company record
            date: date for exchange rate
            
        Returns:
            float: conversion rate where 1 from_currency = X to_currency
        """
        # Handle empty recordsets or missing currencies
        if not from_currency or not to_currency:
            return 1.0
            
        # Same currency = rate 1.0
        if from_currency.id == to_currency.id:
            return 1.0
        
        # Ensure we have valid single records
        from_currency.ensure_one()
        to_currency.ensure_one()
        company.ensure_one()
        
        # Use Odoo's standard _convert method
        # Convert 1.0 from from_currency to to_currency
        rate = from_currency._convert(
            1.0,              # amount to convert
            to_currency,      # target currency
            company,          # company
            date,             # date
            round=False       # don't round the rate
        )
        
        return rate