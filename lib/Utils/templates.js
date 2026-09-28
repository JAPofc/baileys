/** Lightweight message-template manager for @japofc/baileys. */

const TEMPLATE_PATTERN = /\{\{([A-Za-z_][A-Za-z0-9_]*)(?::([^}]*))?\}\}/g;
const makeId = () => `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const parseVariables = (content) => {
    const variables = [];
    const seen = new Set();
    TEMPLATE_PATTERN.lastIndex = 0;

    let match;
    while ((match = TEMPLATE_PATTERN.exec(content)) !== null) {
        const [, name, defaultValue] = match;
        if (seen.has(name)) continue;
        seen.add(name);
        variables.push({ name, defaultValue, required: defaultValue === undefined });
    }

    return variables;
};

export const renderTemplate = (content, data = {}) => String(content).replace(TEMPLATE_PATTERN, (match, name, defaultValue) => {
    const value = data[name];
    if (value !== undefined && value !== null) return String(value);
    if (defaultValue !== undefined) return defaultValue;
    return match;
});

export class TemplateManager {
    templates = new Map();

    generateId() {
        return makeId();
    }

    extractVariables(content) {
        return parseVariables(String(content));
    }

    create(options) {
        if (!options?.name) throw new Error('Template name is required');
        if (typeof options.content !== 'string') throw new Error('Template content must be a string');

        const now = new Date();
        const template = {
            id: options.id ?? this.generateId(),
            name: options.name,
            content: options.content,
            description: options.description,
            category: options.category,
            variables: this.extractVariables(options.content),
            createdAt: now,
            updatedAt: now
        };

        this.templates.set(template.id, template);
        return template;
    }

    get(id) {
        return this.templates.get(id);
    }

    getByName(name) {
        return Array.from(this.templates.values()).find((template) => template.name === name);
    }

    getAll() {
        return Array.from(this.templates.values());
    }

    getByCategory(category) {
        return Array.from(this.templates.values()).filter((template) => template.category === category);
    }

    update(id, updates) {
        const existing = this.templates.get(id);
        if (!existing) return undefined;

        const next = { ...existing, ...updates, updatedAt: new Date() };
        if (Object.prototype.hasOwnProperty.call(updates, 'content')) {
            next.variables = this.extractVariables(next.content);
        }

        this.templates.set(id, next);
        return next;
    }

    delete(id) {
        return this.templates.delete(id);
    }

    renderContent(content, data = {}) {
        return renderTemplate(content, data);
    }

    render(id, data = {}) {
        const template = this.templates.get(id);
        if (!template) throw new Error(`Template not found: ${id}`);
        return this.renderContent(template.content, data);
    }

    validate(id, data) {
        const template = this.templates.get(id);
        if (!template) throw new Error(`Template not found: ${id}`);
        const missing = template.variables
            .filter((variable) => variable.required && !(variable.name in data))
            .map((variable) => variable.name);
        return { valid: missing.length === 0, missing };
    }

    export() {
        return JSON.stringify(Array.from(this.templates.values()), null, 2);
    }

    import(json, overwrite = false) {
        const rows = JSON.parse(json);
        if (!Array.isArray(rows)) throw new Error('Template import payload must be an array');

        let imported = 0;
        for (const row of rows) {
            if (!row?.id || !overwrite && this.templates.has(row.id)) continue;
            this.templates.set(row.id, {
                ...row,
                variables: Array.isArray(row.variables) ? row.variables : this.extractVariables(row.content ?? ''),
                createdAt: new Date(row.createdAt ?? Date.now()),
                updatedAt: new Date(row.updatedAt ?? Date.now())
            });
            imported++;
        }
        return imported;
    }
}

/** Ready-made templates covering common bot scenarios. */
export const PRESET_TEMPLATES = {
    ORDER_CONFIRMATION: {
        name: 'Order Confirmation',
        category: 'order',
        content: `✅ *Order Confirmed!*\n\nOrder ID: #{{orderId}}\nCustomer: {{customerName}}\nDate: {{orderDate}}\n\n📦 *Items:*\n{{items}}\n\n💰 *Total: {{total}}*\n\nThank you! 🙏`
    },
    WELCOME: {
        name: 'Welcome Message',
        category: 'greeting',
        content: `👋 *Welcome, {{name}}!*\n\nThank you for joining {{companyName:us}}!\nNeed help? Reply to this message!`
    },
    REMINDER: {
        name: 'Reminder',
        category: 'notification',
        content: `⏰ *Reminder*\n\nHi {{name}},\n\n📋 {{subject}}\n📅 Date: {{date}}\n🕐 Time: {{time}}\n📍 Location: {{location:TBD}}`
    },
    SUPPORT_TICKET: {
        name: 'Support Ticket',
        category: 'support',
        content: `🎫 *Support Ticket Created*\n\nTicket #: {{ticketId}}\nSubject: {{subject}}\n\nHi {{name}},\n\nWe received your request! Response time: {{responseTime:24 hours}} 🙏`
    },
    BIRTHDAY: {
        name: 'Birthday Wishes',
        category: 'greeting',
        content: `🎂 *Happy Birthday, {{name}}!* 🎉\n\nWishing you a wonderful day!\n\n🎁 Use code: {{code}} for {{discount:10}}% off! 🥳`
    },
    INVOICE: {
        name: 'Invoice',
        category: 'invoice',
        content: `🧾 *Invoice {{invoiceNumber}}*\n\nBilled to: {{customerName}}\nInvoice date: {{invoiceDate}}\nDue date: {{dueDate:on receipt}}\n\n📋 *Items:*\n{{items}}\n\nSubtotal: {{subtotal}}\n💰 *Total: {{total}}*\n\nThank you for your business! 🙏`
    }
};

export const createTemplateManager = (includePresets = true) => {
    const manager = new TemplateManager();
    if (includePresets) {
        for (const [id, template] of Object.entries(PRESET_TEMPLATES)) {
            manager.create({ ...template, id: id.toLowerCase() });
        }
    }
    return manager;
};
