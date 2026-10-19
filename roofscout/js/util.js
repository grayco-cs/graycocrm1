// Small shared helpers.
(function (root) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(n) {
    return '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
  }

  // $292K / $1.2M for tight spaces.
  function moneyShort(n) {
    n = Number(n) || 0;
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return money(n);
  }

  function num(n) { return Math.round(Number(n) || 0).toLocaleString('en-US'); }

  function grade(condition) {
    if (condition < 40) return { label: 'Poor', cls: 'poor' };
    if (condition < 70) return { label: 'Fair', cls: 'fair' };
    return { label: 'Good', cls: 'good' };
  }

  function when(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function today() {
    return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  root.U = { esc: esc, money: money, moneyShort: moneyShort, num: num, grade: grade, when: when, today: today };
})(this);
