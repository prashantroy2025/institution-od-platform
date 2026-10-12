/* Student Fees dashboard.
 *
 * Data sources (existing, no duplicate endpoints):
 *   /api/auth/me                              header avatar
 *   /api/finance/invoices                     the student's own invoices
 *   /api/finance/invoices/:id/statement       items, payments, adjustments, outstanding balance
 *   /api/finance/payments                     offline payment submission (pending verification)
 */
(() => {
    'use strict';

    if (!ERP.token()) { location.replace('login.html'); return; }

    const $ = id => document.getElementById(id);
    const esc = ERP.escapeHtml;
    const NO_YEAR = '__none__';

    const SECTION_TITLES = {
        details: 'Fee Details',
        pay: 'Pay Fee Online',
        receipt: 'Download Receipt',
        installment: 'Installment Plan',
        scholarships: 'Scholarships',
        concessions: 'Concessions',
        history: 'Payment History',
        refunds: 'Refund Status',
        notices: 'Financial Notices'
    };

    let records = [];
    let semester = null;
    let openSection = null;

    const toBig = value => BigInt(value || 0);
    const rupees = value => '₹' + (Number(toBig(value)) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const dateOf = value => {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value ?? '') : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };
    const yearOf = record => record.invoice.academic_year || NO_YEAR;
    const yearLabel = key => (key === NO_YEAR ? 'Other fees' : key);
    const labelOf = record => record.invoice.structure_name || record.invoice.invoice_no;
    const scoped = () => records.filter(record => yearOf(record) === semester);
    const unpaid = () => scoped()
        .filter(record => record.outstanding > 0n)
        .sort((a, b) => (a.invoice.due_date < b.invoice.due_date ? -1 : a.invoice.due_date > b.invoice.due_date ? 1 : 0));
    const isOverdue = record => new Date(record.invoice.due_date) < new Date(new Date().toDateString());
    const empty = text => `<p class="stu-state">${esc(text)}</p>`;
    const kv = (label, value, strong = false) => `<div class="kv${strong ? ' strong' : ''}"><span>${esc(label)}</span><strong>${value}</strong></div>`;

    function setState(message, isError = false) {
        const node = $('pageState');
        node.textContent = message || '';
        node.hidden = !message;
        node.classList.toggle('error', isError);
    }

    function notice(message) {
        $('feesNotice').textContent = message || '';
    }

    function showFailure(message) {
        records = [];
        semester = null;
        renderSemesters();
        $('feePercent').textContent = '--';
        $('feeRing').style.background = 'conic-gradient(#e5e7eb 0deg, #e5e7eb 0deg)';
        $('paidAmount').textContent = '—';
        $('totalFee').textContent = '—';
        $('feeStatusPay').disabled = true;
        $('upcomingBody').innerHTML = `<p class="stu-state error">${esc(message)}</p>`;
        setState(message, true);
    }

    function handleError(error) {
        if (error.status === 401) { ERP.redirectToLogin(); return; }
        showFailure(error.message);
    }

    async function load() {
        const list = await ERP.call('/api/finance/invoices?limit=100');
        const active = list.items.filter(item => item.status !== 'Cancelled');
        const statements = await Promise.all(active.map(item => ERP.call(`/api/finance/invoices/${item.id}/statement`)));
        records = active.map((invoice, index) => {
            const statement = statements[index];
            const payable = toBig(invoice.total_paise) - toBig(invoice.discount_paise) - toBig(invoice.waiver_paise);
            const outstanding = toBig(statement.outstanding_paise);
            return { invoice, statement, payable, outstanding, paid: payable - outstanding };
        });
        if (list.pagination.total > list.items.length) notice('Showing your most recent 100 invoices.');
        setState(records.length ? '' : 'No fee invoices have been issued to your account yet.');
        render();
    }

    function renderSemesters() {
        const select = $('semesterSelect');
        const keys = [...new Set(records.map(yearOf))].sort((a, b) => (a === NO_YEAR ? 1 : b === NO_YEAR ? -1 : b.localeCompare(a)));
        if (!keys.length) {
            select.innerHTML = '<option>No fee records</option>';
            select.disabled = true;
            semester = null;
            return;
        }
        if (!keys.includes(semester)) semester = keys[0];
        select.innerHTML = keys.map(key => `<option value="${esc(key)}"${key === semester ? ' selected' : ''}>${esc(yearLabel(key))}</option>`).join('');
        select.disabled = false;
    }

    function renderSummary() {
        const rows = scoped();
        const payable = rows.reduce((sum, record) => sum + record.payable, 0n);
        const paid = rows.reduce((sum, record) => sum + record.paid, 0n);
        const percent = payable > 0n ? Number(paid * 100n / payable) : 0;
        $('feePercent').textContent = `${percent}%`;
        $('feeRing').style.background = `conic-gradient(#16a34a ${percent * 3.6}deg, #e5e7eb 0deg)`;
        $('paidAmount').textContent = rupees(paid);
        $('totalFee').textContent = rupees(payable);
        $('feeStatusPay').disabled = unpaid().length === 0;
    }

    function renderUpcoming() {
        const body = $('upcomingBody');
        const next = unpaid()[0];
        if (!next) {
            body.innerHTML = empty(records.length ? 'No upcoming payments. Every invoice for this semester is settled.' : 'No upcoming payments.');
            return;
        }
        body.innerHTML = `
            <div class="upcoming-row">
                <div><strong>${esc(labelOf(next))}</strong><small>Due ${esc(dateOf(next.invoice.due_date))}${isOverdue(next) ? ' · <span class="overdue">Overdue</span>' : ''}</small></div>
                <strong>${rupees(next.outstanding)}</strong>
            </div>
            <button class="fees-pay-btn" type="button" data-pay="${esc(next.invoice.id)}">Pay Now</button>`;
    }

    function detailsHtml() {
        const rows = scoped();
        if (!rows.length) return empty('No fee records for this semester.');
        return rows.map(record => `
            <article class="fee-invoice">
                <header><strong>${esc(record.invoice.invoice_no)}</strong><span class="status-pill">${esc(record.invoice.status)}</span></header>
                <p class="muted">${esc(labelOf(record))} · Due ${esc(dateOf(record.invoice.due_date))}</p>
                <div class="kv-list">
                    ${record.statement.items.map(item => kv(item.name, rupees(item.amount_paise))).join('')}
                    ${kv('Total', rupees(record.invoice.total_paise), true)}
                    ${kv('Discounts', `- ${rupees(record.invoice.discount_paise)}`)}
                    ${kv('Waivers', `- ${rupees(record.invoice.waiver_paise)}`)}
                    ${kv('Payable', rupees(record.payable), true)}
                    ${kv('Paid (verified)', rupees(record.paid))}
                    ${kv('Outstanding', rupees(record.outstanding), true)}
                </div>
            </article>`).join('');
    }

    function payHtml(invoiceId) {
        const open = unpaid();
        if (!open.length) return empty('No outstanding balance for this semester.');
        const selected = open.find(record => String(record.invoice.id) === String(invoiceId)) || open[0];
        return `
            <p class="fees-note">Online payment is not configured for this installation. Submit an offline payment with your bank or UPI reference. It stays Pending until the finance office verifies it.</p>
            <form id="payForm" class="pay-form">
                <label>Invoice
                    <select name="invoice_id">${open.map(record => `<option value="${esc(record.invoice.id)}"${record.invoice.id === selected.invoice.id ? ' selected' : ''}>${esc(record.invoice.invoice_no)} · ${esc(rupees(record.outstanding))} due</option>`).join('')}</select>
                </label>
                <label>Amount (₹)
                    <input name="amount" inputmode="decimal" required value="${(Number(selected.outstanding) / 100).toFixed(2)}" autocomplete="off">
                </label>
                <label>Bank / UPI reference
                    <input name="reference_no" required maxlength="120" autocomplete="off">
                </label>
                <button class="fees-pay-btn" type="submit">Submit payment</button>
            </form>`;
    }

    const paymentRow = (payment, invoiceNo) => `
        <div class="list-row">
            <div><strong>${esc(rupees(payment.amount_paise))}</strong><small>${esc(invoiceNo)} · ${esc(payment.method)}${payment.reference_no ? ' · Ref ' + esc(payment.reference_no) : ''}</small><small>${esc(dateOf(payment.created_at))}</small></div>
            <span class="status-pill status-${esc(payment.status.toLowerCase().replace(/\s+/g, '-'))}">${esc(payment.status)}</span>
        </div>`;

    const scopedPayments = (status = null) => scoped().flatMap(record => record.statement.payments
        .filter(payment => status === null || payment.status === status)
        .map(payment => ({ payment, invoiceNo: record.invoice.invoice_no })));

    function historyHtml() {
        const payments = scopedPayments();
        if (!payments.length) return empty('No payments submitted for this semester.');
        return payments.map(({ payment, invoiceNo }) => paymentRow(payment, invoiceNo)).join('');
    }

    function receiptHtml() {
        const intro = '<p class="fees-note">Receipt generation is not available in this installation yet. Verified payments are listed for reference only.</p>';
        const verified = scopedPayments('Verified');
        if (!verified.length) return intro + empty('No verified payments yet. A receipt can only be issued after the finance office verifies a payment.');
        return intro + verified.map(({ payment, invoiceNo }) => paymentRow(payment, invoiceNo)).join('');
    }

    function adjustmentsHtml(kinds, emptyText) {
        const items = scoped().flatMap(record => record.statement.adjustments
            .filter(adjustment => kinds.includes(adjustment.kind))
            .map(adjustment => ({ adjustment, invoiceNo: record.invoice.invoice_no })));
        if (!items.length) return empty(emptyText);
        return items.map(({ adjustment, invoiceNo }) => `
            <div class="list-row">
                <div><strong>${esc(adjustment.kind)} · ${esc(rupees(adjustment.amount_paise))}</strong><small>${esc(invoiceNo)} · ${esc(adjustment.reason)}</small><small>${esc(dateOf(adjustment.created_at))}</small></div>
            </div>`).join('');
    }

    function refundsHtml() {
        const refunded = scopedPayments('Refunded');
        const refundAdjustments = scoped().flatMap(record => record.statement.adjustments
            .filter(adjustment => adjustment.kind === 'Refund')
            .map(adjustment => ({ adjustment, invoiceNo: record.invoice.invoice_no })));
        if (!refunded.length && !refundAdjustments.length) {
            return empty('No refunds on record. Refund requests are not yet available in this installation.');
        }
        return refunded.map(({ payment, invoiceNo }) => paymentRow(payment, invoiceNo)).join('')
            + refundAdjustments.map(({ adjustment, invoiceNo }) => `
                <div class="list-row">
                    <div><strong>Refund · ${esc(rupees(adjustment.amount_paise))}</strong><small>${esc(invoiceNo)} · ${esc(adjustment.reason)}</small><small>${esc(dateOf(adjustment.created_at))}</small></div>
                </div>`).join('');
    }

    const PANEL_RENDERERS = {
        details: () => detailsHtml(),
        pay: invoiceId => payHtml(invoiceId),
        receipt: () => receiptHtml(),
        installment: () => `<p class="fees-note">Installment plans are not configured for this installation yet.</p>`,
        scholarships: () => adjustmentsHtml(['Scholarship', 'Aid'], 'No scholarships have been applied to your invoices for this semester.'),
        concessions: () => adjustmentsHtml(['Discount', 'Waiver'], 'No concessions have been applied to your invoices for this semester.'),
        history: () => historyHtml(),
        refunds: () => refundsHtml(),
        notices: () => `<p class="fees-note">Financial notices are not configured for this installation yet.</p>`
    };

    function renderPanel(section, invoiceId) {
        openSection = section;
        document.querySelectorAll('.fees-tile').forEach(tile => tile.classList.toggle('active', tile.dataset.section === section));
        const panel = $('panel');
        panel.hidden = false;
        panel.innerHTML = `<div class="panel-head"><h2>${esc(SECTION_TITLES[section])}</h2><button class="link" type="button" data-close>Close</button></div>${PANEL_RENDERERS[section](invoiceId)}`;
    }

    function openPanel(section, invoiceId) {
        renderPanel(section, invoiceId);
        $('panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function closePanel() {
        openSection = null;
        document.querySelectorAll('.fees-tile').forEach(tile => tile.classList.remove('active'));
        $('panel').hidden = true;
        $('panel').innerHTML = '';
    }

    function render() {
        renderSemesters();
        renderSummary();
        renderUpcoming();
        if (openSection) renderPanel(openSection);
    }

    async function submitPayment(form) {
        const data = new FormData(form);
        const amount = String(data.get('amount') || '').trim();
        if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
            notice('Enter a valid amount in rupees, for example 1500.00.');
            return;
        }
        const reference = String(data.get('reference_no') || '').trim();
        if (!reference) {
            notice('Enter your bank or UPI reference.');
            return;
        }
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            const result = await ERP.call('/api/finance/payments', {
                method: 'POST',
                body: {
                    invoice_id: Number(data.get('invoice_id')),
                    amount_paise: String(Math.round(Number(amount) * 100)),
                    method: 'Offline',
                    reference_no: reference
                }
            });
            await load();
            openPanel('history');
            notice(`Payment #${result.id} submitted and is pending verification.`);
        } catch (error) {
            if (error.status === 401) { ERP.redirectToLogin(); return; }
            notice(error.message);
            button.disabled = false;
        }
    }

    $('semesterSelect').addEventListener('change', event => { semester = event.target.value; closePanel(); render(); });
    $('viewAllBtn').addEventListener('click', () => openPanel('details'));
    document.querySelectorAll('.fees-tile').forEach(tile => tile.addEventListener('click', () => openPanel(tile.dataset.section)));
    $('feeStatusPay').addEventListener('click', () => {
        const next = unpaid()[0];
        if (next) openPanel('pay', next.invoice.id);
    });
    $('upcomingBody').addEventListener('click', event => {
        const button = event.target.closest('[data-pay]');
        if (button) openPanel('pay', button.dataset.pay);
    });
    $('panel').addEventListener('click', event => {
        if (event.target.closest('[data-close]')) closePanel();
    });
    $('panel').addEventListener('change', event => {
        if (event.target.name !== 'invoice_id') return;
        const record = records.find(item => String(item.invoice.id) === event.target.value);
        if (record) $('panel').querySelector('input[name="amount"]').value = (Number(record.outstanding) / 100).toFixed(2);
    });
    $('panel').addEventListener('submit', event => {
        if (event.target.id !== 'payForm') return;
        event.preventDefault();
        submitPayment(event.target);
    });

    ERP.call('/api/auth/me')
        .then(profile => { $('topAvatarInitial').textContent = (profile.name || '?').trim().charAt(0).toUpperCase() || '?'; })
        .catch(error => { if (error.status === 401) ERP.redirectToLogin(); });
    load().catch(handleError);
})();
