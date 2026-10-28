// Stand-in for @minecraft/server-ui: forms answer with their defaults (or mockFormAnswer when set).
export let mockFormAnswer = null;
export function setMockFormAnswer(v) {
    mockFormAnswer = v;
}

export class ModalFormData {
    constructor() {
        this.fields = [];
    }
    title() {
        return this;
    }
    textField(label, placeholder, opts) {
        this.fields.push(typeof opts === 'object' ? opts?.defaultValue ?? '' : opts ?? '');
        return this;
    }
    toggle(label, opts) {
        this.fields.push(typeof opts === 'object' ? !!opts?.defaultValue : !!opts);
        return this;
    }
    submitButton() {
        return this;
    }
    show() {
        const values = mockFormAnswer !== null ? [mockFormAnswer] : this.fields;
        return Promise.resolve({ canceled: false, formValues: values });
    }
}

export class ActionFormData {
    title() {
        return this;
    }
    body() {
        return this;
    }
    button() {
        return this;
    }
    show() {
        return Promise.resolve({ canceled: true });
    }
}

export class MessageFormData extends ActionFormData {}
