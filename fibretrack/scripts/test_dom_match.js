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
      if (sel.includes('label') && c.tagName === 'LABEL') return c;
      if (sel.includes('legend') && c.tagName === 'LEGEND') return c;
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

// Test différents scénarios DOM pour le champ "Crochets" dans CelPros:
console.log('=== TEST MATCH ELEMENT TO FIELD POUR CROCHETS ===\n');

// Scénario 1: Angular Material <mat-form-field> avec <mat-label>Crochets</mat-label>
console.log('--- Scénario 1: Angular Material (mat-form-field) ---');
const matField = new MockElement('mat-form-field', { class: 'mat-form-field' });
const matLabel = new MockElement('mat-label', { textContent: 'Crochets' });
const matInput = new MockElement('input', {
  id: 'mat-input-15',
  name: 'crochets',
  formcontrolname: 'crochets',
  type: 'number'
});
matField.appendChild(matLabel);
matField.appendChild(matInput);

const match1 = FieldMapping.matchElementToField(matInput);
console.log('Match 1 (id=mat-input-15, name=crochets):', match1 ? match1.definition.key : 'NULL');

// Scénario 2: input avec id générique Angular (id="mat-input-16") mais SEUL le label/placeholder dit "Crochets"
console.log('\n--- Scénario 2: id générique Angular, label "Crochets" ---');
const matField2 = new MockElement('mat-form-field', { class: 'mat-form-field' });
const matLabel2 = new MockElement('mat-label', { textContent: 'Crochets' });
const matInput2 = new MockElement('input', {
  id: 'mat-input-16',
  type: 'text'
});
matField2.appendChild(matLabel2);
matField2.appendChild(matInput2);

const match2 = FieldMapping.matchElementToField(matInput2);
console.log('Match 2 (label mat-label "Crochets"):', match2 ? match2.definition.key : 'NULL');

// Scénario 3: input avec div parent class="col", label au dessus "Crochets"
console.log('\n--- Scénario 3: div.col avec label sibling ---');
const colDiv = new MockElement('div', { class: 'col' });
const label3 = new MockElement('label', { textContent: 'Crochets' });
const input3 = new MockElement('input', {
  id: 'field_crochets',
  name: 'crochets',
  type: 'number'
});
colDiv.appendChild(label3);
colDiv.appendChild(input3);

const match3 = FieldMapping.matchElementToField(input3);
console.log('Match 3 (field_crochets):', match3 ? match3.definition.key : 'NULL');

// Scénario 4: input avec id="field_crochets", SANS label sibling
console.log('\n--- Scénario 4: input id="field_crochets", sans label ---');
const input4 = new MockElement('input', {
  id: 'field_crochets',
  type: 'number'
});
const match4 = FieldMapping.matchElementToField(input4);
console.log('Match 4 (id=field_crochets seul):', match4 ? match4.definition.key : 'NULL');
