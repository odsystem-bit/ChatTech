import fs from 'node:fs';
import ssh2 from '../../fibretrack/node_modules/ssh2/lib/index.js';
import '../content/field-mapping.js';
import '../content/photo-filler.js';
import '../content/form-filler.js';

const { Client } = ssh2;
const FieldMapping = globalThis.FieldMapping;
const PhotoFiller = globalThis.PhotoFiller;
const FormFiller = globalThis.FormFiller;

const host = '82.29.191.42';
const port = 65002;
const username = 'u795734321';
const privateKeyPath = 'C:\\Users\\Davyh\\.ssh\\id_ed25519';
const remoteBase = '/home/u795734321/domains/fibretrack.mantota.com/public_html';

const privateKey = fs.readFileSync(privateKeyPath);
const conn = new Client();

conn.on('ready', () => {
  conn.exec(`php -r '
    require_once "${remoteBase}/api/_env.php";
    $pdo = new PDO("mysql:host=".getenv("DB_HOST").";dbname=".getenv("DB_NAME"), getenv("DB_USER"), getenv("DB_PASS"));
    $stmt = $pdo->prepare("SELECT * FROM interventions WHERE id = ?");
    $stmt->execute(["6c7e0124-1ad8-4146-b29f-ca2c5f81cb07"]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $row["materiel_pose"] = json_decode($row["materiel_pose"] ?? "{}", true);
    $row["points_gps"] = json_decode($row["points_gps"] ?? "[]", true);
    $row["whatsapp_photos"] = json_decode($row["whatsapp_photos"] ?? "[]", true);
    echo json_encode($row);
  '`, (err, stream) => {
    let out = '';
    stream.on('data', d => out += d);
    stream.stderr.on('data', d => console.error('STDERR:', d.toString()));
    stream.on('close', () => {
      const data = JSON.parse(out);

      console.log('=== TEST REGLES SUR DONNEES REELLES 6c7e0124 ===');
      for (const rule of PhotoFiller.PHOTO_SLOT_RULES) {
        const photo = rule.getPhoto(data);
        console.log(`Rule [${rule.key}]: ${photo ? `FOUND -> ${photo.name} (${photo.src.split('/').pop()})` : 'NULL'}`);
      }

      console.log('\n=== POLE PHOTOS DETECTEES ===');
      const pts = Array.isArray(data?.points_gps) ? data.points_gps : [];
      pts.forEach((p, i) => {
        console.log(`pt[${i}]: type=${p.type} num=${p.numero} photo=${p.photo ? p.photo.split('/').pop() : 'none'}`);
      });
      const wa = PhotoFiller.getEligibleWhatsappPhotos(data);
      wa.forEach((p, i) => {
        const desc = [p.slot, p.name, p.nom, p.title, p.titre, p.type, p.sous_type, p.label, p.caption, p.description, p.lieu, p.proprietaire].filter(Boolean).join(" ").toLowerCase();
        if (desc.includes("poteau") || String(p.slot).includes("poteau")) {
          console.log(`wa[${i}]: slot=${p.slot} type=${p.type} name=${p.name} desc=${desc.slice(0, 40)} url=${p.url ? p.url.split('/').pop() : 'none'}`);
        }
      });

      // Simulation du DOM de l'étape 4 de CelPros
      class MockElement {
        constructor(tag, attrs = {}) {
          this.tagName = tag.toUpperCase();
          this.id = attrs.id || '';
          this.name = attrs.name || '';
          this.type = attrs.type || 'text';
          this.innerText = attrs.innerText || '';
          this.textContent = attrs.innerText || '';
          this.attributes = { ...attrs };
          this.children = [];
          this.parentElement = null;
          this.ownerDocument = null;
          this.style = {};
          this.clientHeight = attrs.clientHeight || 80;
          this.clientWidth = attrs.clientWidth || 200;
        }
        getAttribute(a) { return this.attributes[a] || null; }
        setAttribute(a, v) { this.attributes[a] = v; }
        appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
        querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
        querySelectorAll(sel) {
          const res = [];
          const walk = (n) => {
            for (const ch of n.children) {
              if (sel === 'input[type="file"]' && ch.tagName === 'INPUT' && ch.type === 'file') res.push(ch);
              else if (sel.includes('input') && ch.tagName === 'INPUT') res.push(ch);
              else if (sel.includes('.upload-box') && ch.attributes.className === 'upload-box') res.push(ch);
              else if (['label', 'h3', 'h4', 'h5', 'strong'].some(t => sel.includes(t)) && ['LABEL','H3','H4','H5','STRONG'].includes(ch.tagName)) res.push(ch);
              walk(ch);
            }
          };
          walk(this);
          return res;
        }
        closest(sel) {
          let curr = this;
          while (curr) {
            if (sel.split(',').some(s => curr.tagName.toLowerCase() === s.trim().toLowerCase())) return curr;
            curr = curr.parentElement;
          }
          return null;
        }
        dispatchEvent() {}
      }

      class MockDocument {
        constructor(root) {
          this.root = root;
          root.ownerDocument = this;
        }
        querySelectorAll(sel) { return this.root.querySelectorAll(sel); }
        querySelector(sel) { return this.root.querySelector(sel); }
        getElementById(id) {
          const all = this.root.querySelectorAll('*');
          return all.find(e => e.id === id) || null;
        }
        createElement(tag) { return new MockElement(tag); }
      }

      console.log('\n=== SIMULATION DOM STEP 4 CELPROS ===');
      const root = new MockElement('div');
      
      // Step 4 Section
      const sec4 = new MockElement('section', { className: 'step-section' });
      root.appendChild(sec4);

      // Box 1: Image entrée câble interne *
      const box1 = new MockElement('div', { className: 'upload-box', innerText: 'Image entrée câble interne *' });
      const inp1 = new MockElement('input', { type: 'file', id: 'field_cableInterne', name: 'cableInterne' });
      box1.appendChild(inp1);
      sec4.appendChild(box1);

      // Box 2: Image entrée câble externe *
      const box2 = new MockElement('div', { className: 'upload-box', innerText: 'Image entrée câble externe *' });
      const inp2 = new MockElement('input', { type: 'file', id: 'field_cableExterne', name: 'cableExterne' });
      box2.appendChild(inp2);
      sec4.appendChild(box2);

      // Section Poteaux
      const poteauxHeader = new MockElement('h4', { innerText: 'Poteaux traversés' });
      sec4.appendChild(poteauxHeader);
      const boxPoteau1 = new MockElement('div', { className: 'upload-box', innerText: 'Photo Poteau 1' });
      const inpPoteau1 = new MockElement('input', { type: 'file', id: 'field_poteau1', name: 'poteau1' });
      boxPoteau1.appendChild(inpPoteau1);
      sec4.appendChild(boxPoteau1);

      const doc = new MockDocument(root);

      PhotoFiller.fillPhotosOnPage(data, doc).then(report => {
        console.log('Fill Report:', JSON.stringify(report, null, 2));
        console.log('\nResultats des inputs:');
        console.log('inp1 (cableInterne): files =', inp1.files?.map(f => f.name));
        console.log('inp2 (cableExterne): files =', inp2.files?.map(f => f.name));
        console.log('inpPoteau1: files =', inpPoteau1.files?.map(f => f.name));
        conn.end();
      });
    });
  });
});

conn.connect({ host, port, username, privateKey });
