import test from 'node:test';
import assert from 'node:assert/strict';
import '../content/field-mapping.js';
import '../content/photo-filler.js';
import '../content/form-filler.js';

const PhotoFiller = globalThis.PhotoFiller;

class MockElement {
  constructor(tagName = 'div', attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.id = attrs.id || '';
    this.name = attrs.name || '';
    this.type = attrs.type || 'text';
    this.value = attrs.value || '';
    this.innerText = attrs.innerText || '';
    this.textContent = attrs.textContent || attrs.innerText || '';
    this.className = attrs.className || '';
    this.placeholder = attrs.placeholder || '';
    this.attributes = { ...attrs };
    this.style = {};
    this.children = [];
    this.parentElement = null;
    this.files = [];
    this.classList = {
      contains: (c) => (this.className || '').split(/\s+/).includes(c),
    };
  }

  getAttribute(attr) {
    return this.attributes[attr] || null;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  closest(selector) {
    const list = selector.split(',').map((s) => s.trim().toLowerCase());
    let curr = this;
    while (curr) {
      for (const sel of list) {
        if (sel === 'div' && curr.tagName === 'DIV') return curr;
        if (sel === 'button' && curr.tagName === 'BUTTON') return curr;
        if (sel === 'a' && curr.tagName === 'A') return curr;
        if (sel === '.card' && curr.classList.contains('card')) return curr;
        if (sel === 'div.col-12' && curr.tagName === 'DIV' && curr.classList.contains('col-12')) return curr;
        if (sel === '.col-12' && curr.classList.contains('col-12')) return curr;
        if (sel === '.d-flex' && curr.classList.contains('d-flex')) return curr;
        if (sel === '.row' && curr.classList.contains('row')) return curr;
        if (sel === 'section' && curr.tagName === 'SECTION') return curr;
        if (sel === 'form' && curr.tagName === 'FORM') return curr;
        if (sel.startsWith('.') && curr.classList.contains(sel.slice(1))) return curr;
      }
      curr = curr.parentElement;
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    const walk = (node) => {
      for (const child of node.children) {
        let match = false;
        if (selector === 'input[type="file"]') {
          if (child.tagName === 'INPUT' && child.type === 'file') match = true;
        } else if (selector.includes('input:not([type="file"])')) {
          if (child.tagName === 'INPUT' && child.type !== 'file') match = true;
        } else if (selector.includes('input') && child.tagName === 'INPUT') {
          match = true;
        } else if (selector.includes('button') && (child.tagName === 'BUTTON' || child.classList.contains('btn') || child.tagName === 'I' || child.tagName === 'SPAN')) {
          match = true;
        } else if (selector.includes('h1') && ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'STRONG', 'B', 'SPAN', 'DIV'].includes(child.tagName)) {
          match = true;
        }
        if (match) results.push(child);
        walk(child);
      }
    };
    walk(this);
    return results;
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all[0] || null;
  }

  dispatchEvent(event) {
    if (event.type === 'click' && typeof this._clickHandler === 'function') {
      this._clickHandler(event);
    }
    return true;
  }

  compareDocumentPosition(other) {
    // Return DOCUMENT_POSITION_FOLLOWING (4) for dynamic siblings appended after
    return 4;
  }
}

if (!globalThis.Event) {
  globalThis.Event = class {
    constructor(type, opts = {}) {
      this.type = type;
      this.bubbles = opts.bubbles || false;
    }
  };
}
if (!globalThis.MouseEvent) {
  globalThis.MouseEvent = class {
    constructor(type, opts = {}) {
      this.type = type;
      this.bubbles = opts.bubbles || false;
    }
  };
}

test("CelPros Sibling Poles - Structure Angular réelle avec injection en frères de col-12 et JSON stringifié", async () => {
  // Structure CelPros Step 4 réelle:
  // <div class="card card-rattachement">
  //   <div class="col-12 header-row">
  //     <h5>POTEAUX <button class="btn btn-sm btn-plus"><i class="fa fa-plus"></i></button></h5>
  //     <small>Aucune photo — appuyez sur + pour ajouter (max 10)</small>
  //   </div>
  //   <!-- Angular insère chaque nouveau poteau en frère de col-12 dans la carte : -->
  // </div>
  const card = new MockElement("div", { className: "card card-rattachement" });
  const headerCol = new MockElement("div", { className: "col-12 header-row" });
  const headerDflex = new MockElement("div", { className: "d-flex justify-content-between align-items-center" });
  const title = new MockElement("h5", { innerText: "POTEAUX" });
  const addBtn = new MockElement("button", { className: "btn btn-sm btn-plus", innerText: "+" });
  const icon = new MockElement("i", { className: "fa fa-plus" });
  addBtn.appendChild(icon);
  headerDflex.appendChild(title);
  headerDflex.appendChild(addBtn);
  headerCol.appendChild(headerDflex);
  card.appendChild(headerCol);

  const createdInputs = [];
  let addedCount = 0;
  addBtn._clickHandler = () => {
    addedCount++;
    const poleRow = new MockElement("div", { className: "col-12 pole-row" });
    const uploadBox = new MockElement("div", { className: "upload-box" });
    const fileInput = new MockElement("input", {
      type: "file",
      id: `poteau_file_${addedCount}`,
      name: `poteau_file_${addedCount}`,
    });
    const coordInput = new MockElement("input", {
      type: "text",
      id: `poteau_coords_${addedCount}`,
      placeholder: "Coordonnées GPS",
    });
    uploadBox.appendChild(fileInput);
    poleRow.appendChild(uploadBox);
    poleRow.appendChild(coordInput);
    card.appendChild(poleRow);
    createdInputs.push({ fileInput, coordInput });
  };

  // Données d'intervention avec strings JSON (comme MySQL api/index.php)
  const data = {
    nom_client: "ANAGONOU ALLELUIA DORCAS",
    points_gps: JSON.stringify([
      { type: "Poteau", numero: 1, lat: 6.3795295, lng: 2.6042044, photo: "data:image/jpeg;base64,ZHVtbXkx" },
      { type: "Poteau", numero: 2, lat: 6.37953, lng: 2.6041965, photo: "data:image/jpeg;base64,ZHVtbXky" },
    ]),
    whatsapp_photos: JSON.stringify([
      { slot: "autre_poteau", name: "autre_poteau_1.jpg", lat: 6.428008, lng: 2.293967, url: "data:image/jpeg;base64,ZHVtbXkz" },
      { slot: "autre_poteau", name: "autre_poteau_2.jpg", lat: 6.3794683, lng: 2.6042267, url: "data:image/jpeg;base64,ZHVtbXk0" },
    ]),
  };

  const res = await PhotoFiller.fillPhotosOnPage(data, card);
  assert.ok(res.success, "fillPhotosOnPage doit réussir");
  assert.equal(res.details.length, 4, "Les 4 poteaux (2 GPS + 2 autres poteaux) doivent être injectés");

  // Ordre strict : Poteau 1, Poteau 2, Autre Poteau 1, Autre Poteau 2
  assert.equal(res.details[0].label, "Poteau 1");
  assert.equal(res.details[0].fileName, "poteau_1.jpg");
  assert.equal(createdInputs[0].coordInput.value, "6.379530, 2.604204");

  assert.equal(res.details[1].label, "Poteau 2");
  assert.equal(res.details[1].fileName, "poteau_2.jpg");
  assert.equal(createdInputs[1].coordInput.value, "6.379530, 2.604197");

  assert.equal(res.details[2].label, "Autre Poteau 1");
  assert.equal(res.details[2].fileName, "autre_poteau_1.jpg");
  assert.equal(createdInputs[2].coordInput.value, "6.428008, 2.293967");

  assert.equal(res.details[3].label, "Autre Poteau 2");
  assert.equal(res.details[3].fileName, "autre_poteau_2.jpg");
  assert.equal(createdInputs[3].coordInput.value, "6.379468, 2.604227");
});
