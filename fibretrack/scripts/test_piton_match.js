import '../../extension-celpros/content/field-mapping.js';

const FieldMapping = globalThis.FieldMapping;

class MockElement {
  constructor(tagName = 'div', attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.id = attrs.id || '';
    this.name = attrs.name || '';
    this.type = attrs.type || 'text';
    this.value = attrs.value || '';
    this.attributes = { ...attrs };
    this.children = [];
    this.parentElement = null;
    this.ownerDocument = null;
    this.placeholder = attrs.placeholder || '';
    this.textContent = attrs.textContent || '';
    this.innerText = attrs.innerText || '';
  }
  getAttribute(attr) { return this.attributes[attr] || this.attributes[attr.toLowerCase()] || null; }
  setAttribute(attr, val) { this.attributes[attr] = val; }
  appendChild(child) {
    child.parentElement = this;
    child.ownerDocument = this.ownerDocument;
    this.children.push(child);
    return child;
  }
  querySelector(sel) {
    for (const c of this.children) {
      if (sel.includes(c.tagName.toLowerCase())) return c;
      const found = c.querySelector(sel);
      if (found) return found;
    }
    return null;
  }
  closest(sel) {
    let curr = this;
    while (curr) {
      if (sel.includes(curr.tagName.toLowerCase())) return curr;
      if (curr.attributes.class && sel.includes(curr.attributes.class)) return curr;
      curr = curr.parentElement;
    }
    return null;
  }
}

const matField = new MockElement('mat-form-field', { class: 'mat-form-field' });
const matLabel = new MockElement('mat-label', { textContent: 'Piton' });
const matInput = new MockElement('input', {
  id: 'mat-input-17',
  type: 'text'
});
matField.appendChild(matLabel);
matField.appendChild(matInput);

const matchPiton = FieldMapping.matchElementToField(matInput);
console.log('Match Piton with only mat-label:', matchPiton ? matchPiton.definition.key : 'NULL');
