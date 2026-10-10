/* Shared inline UI feedback helpers.
   Replaces native alert()/prompt() so the four ERP screens stay keyboard accessible,
   do not block rendering, and match the approved design. */
window.ERPUI = (function () {
    let stack = null;
    const escapeHtml = value => String(value === undefined || value === null ? '' : value)
        .replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

    function region() {
        if (!stack || !document.body.contains(stack)) {
            stack = document.createElement('div');
            stack.className = 'ui-feedback-stack';
            stack.setAttribute('role', 'status');
            stack.setAttribute('aria-live', 'polite');
            document.body.appendChild(stack);
        }
        return stack;
    }

    function push(message, tone) {
        const item = document.createElement('div');
        item.className = `ui-feedback ${tone || 'info'}`;
        item.innerHTML = `<span>${escapeHtml(message)}</span><button type="button" aria-label="Dismiss message">✕</button>`;
        item.querySelector('button').addEventListener('click', () => item.remove());
        region().appendChild(item);
        setTimeout(() => item.remove(), tone === 'error' ? 8000 : 5000);
        return item;
    }

    function form(title, fields, submitLabel) {
        return new Promise(resolve => {
            const host = document.createElement('div');
            host.className = 'ui-modal-backdrop';
            const id = name => `ui-${name}`;
            host.innerHTML = `<div class="ui-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
                <form id="${id('form')}">
                    <h3>${escapeHtml(title)}</h3>
                    ${fields.map(f => `<label for="${id(f.name)}">${escapeHtml(f.label)}</label>
                    <input id="${id(f.name)}" name="${escapeHtml(f.name)}" type="${f.type || 'text'}" maxlength="${f.maxLength || 500}" value="${escapeHtml(f.value || '')}" ${f.required === false ? '' : 'required'} autocomplete="off">`).join('')}
                    <div class="ui-modal-actions">
                        <button type="button" class="secondary-btn" data-cancel>Cancel</button>
                        <button type="submit" class="primary-btn">${escapeHtml(submitLabel || 'Save')}</button>
                    </div>
                </form></div>`;
            document.body.appendChild(host);
            const form = host.querySelector(`#${id('form')}`);
            const close = value => { host.remove(); document.removeEventListener('keydown', onKey); resolve(value); };
            const focusable = form.querySelector('input');
            if (focusable) focusable.focus();
            const onKey = event => {
                if (event.key === 'Escape') { event.preventDefault(); close(null); }
                if (event.key === 'Tab') {
                    const inputs = [...form.querySelectorAll('input,button')];
                    const first = inputs[0]; const last = inputs[inputs.length - 1];
                    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
                }
            };
            document.addEventListener('keydown', onKey);
            host.addEventListener('click', event => { if (event.target === host || event.target.hasAttribute('data-cancel')) close(null); });
            form.addEventListener('submit', event => {
                event.preventDefault();
                const values = {};
                for (const input of form.querySelectorAll('input')) values[input.name] = input.value.trim();
                close(values);
            });
        });
    }

    function confirmDialog(message, confirmLabel) {
        return new Promise(resolve => {
            const host = document.createElement('div');
            host.className = 'ui-modal-backdrop';
            host.innerHTML = `<div class="ui-modal" role="alertdialog" aria-modal="true" aria-label="Confirm action">
                <h3>Please confirm</h3><p class="ui-modal-message">${escapeHtml(message)}</p>
                <div class="ui-modal-actions">
                    <button type="button" class="secondary-btn" data-cancel>Cancel</button>
                    <button type="button" class="danger-btn" data-confirm>${escapeHtml(confirmLabel || 'Confirm')}</button>
                </div></div>`;
            document.body.appendChild(host);
            const confirmButton = host.querySelector('[data-confirm]');
            confirmButton.focus();
            const close = value => { host.remove(); document.removeEventListener('keydown', onKey); resolve(value); };
            const onKey = event => {
                if (event.key === 'Escape') { event.preventDefault(); close(false); }
                if (event.key === 'Tab') {
                    const inputs = [...host.querySelectorAll('button')];
                    const first = inputs[0]; const last = inputs[inputs.length - 1];
                    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
                }
            };
            document.addEventListener('keydown', onKey);
            host.addEventListener('click', event => {
                if (event.target === host || event.target.hasAttribute('data-cancel')) close(false);
                if (event.target.hasAttribute('data-confirm')) close(true);
            });
        });
    }

    return {
        info: message => push(message, 'info'),
        success: message => push(message, 'success'),
        error: message => push(message, 'error'),
        form,
        confirm: confirmDialog
    };
})();
