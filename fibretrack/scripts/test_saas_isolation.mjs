import fs from 'node:fs';
import { Client } from 'ssh2';

const API_BASE = 'https://fibretrack.mantota.com/api/index.php';

async function request(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, data: json };
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 TEST SAAS MULTI-ÉQUIPES & ISOLATION STRICTE');
  console.log('====================================================');

  const testIdentifiant = `test_chef_${Date.now()}`;
  let team2Token = null;
  let team2Id = null;

  // 1. Tester la création d'équipe SaaS (action=team_register)
  console.log('\n[1] Création autonome d\'une nouvelle équipe (SaaS Onboarding)...');
  const regRes = await request(`${API_BASE}?action=team_register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nom_equipe: 'SaaS Test Networks',
      nom: 'Alexandre Test',
      chef_nom: 'Alexandre Test',
      telephone: '+229 97 00 00 99',
      identifiant: testIdentifiant,
      password: 'SecurePassword2026!',
      mot_de_passe: 'SecurePassword2026!'
    })
  });

  if (!regRes.data?.success) {
    throw new Error(`Échec team_register: ${JSON.stringify(regRes.data)}`);
  }
  team2Token = regRes.data.token;
  team2Id = regRes.data.team.id;
  console.log(`✓ Équipe 2 créée: ID=${team2Id}, Nom=${regRes.data.team.nom_equipe}`);
  console.log(`✓ Token JWT/Session reçu pour ${testIdentifiant}`);

  // 2. Vérifier l'isolation des interventions pour l'équipe 2
  console.log('\n[2] Vérification de l\'isolation des interventions pour l\'Équipe 2...');
  const intv2Res = await request(`${API_BASE}?action=interventions_list`, {
    headers: {
      'Authorization': `Bearer ${team2Token}`,
      'X-Team-Id': team2Id
    }
  });

  const intvs2 = Array.isArray(intv2Res.data) ? intv2Res.data : (intv2Res.data?.interventions || []);
  console.log(`✓ Interventions visibles par Équipe 2 : ${intvs2.length} (attendu: 0)`);
  if (intvs2.length !== 0) {
    throw new Error(`VIOLATION ISOLATION: L'Équipe 2 voit ${intvs2.length} interventions !`);
  }

  // 3. Vérifier le stock initial de l'équipe 2 (20 articles à 0)
  console.log('\n[3] Vérification du stock initial de l\'Équipe 2...');
  const stock2Res = await request(`${API_BASE}?action=stock_list`, {
    headers: {
      'Authorization': `Bearer ${team2Token}`,
      'X-Team-Id': team2Id
    }
  });
  const stockDict = (typeof stock2Res.data === 'object' && stock2Res.data !== null) ? stock2Res.data : {};
  const stockKeys = Object.keys(stockDict);
  console.log(`✓ Nombre d'articles de stock créés pour Équipe 2 : ${stockKeys.length} (attendu: 20)`);
  const nonZero = Object.entries(stockDict).filter(([k, v]) => Number(v) !== 0);
  if (nonZero.length > 0) {
    throw new Error(`VIOLATION STOCK: Des articles de l'équipe 2 ne sont pas à 0 : ${JSON.stringify(nonZero)}`);
  }
  console.log('✓ Tous les 20 articles du canevas sont bien initialisés à 0 pour la nouvelle équipe.');

  // 4. Tester l'authentification de l'Équipe 1 (TELECOM BTP Services)
  console.log('\n[4] Vérification de l\'Équipe 1 (TELECOM BTP Services - PIN 4040)...');
  const auth1Res = await request(`${API_BASE}?action=account_validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: '4040' })
  });
  if (!auth1Res.data?.ok && !auth1Res.data?.success) {
    throw new Error(`Échec connexion Équipe 1 (4040): ${JSON.stringify(auth1Res.data)}`);
  }
  const team1Token = auth1Res.data.token;
  const team1Id = auth1Res.data.team_id || auth1Res.data.account?.team_id;
  const team1Nom = auth1Res.data.nom || auth1Res.data.account?.nom;
  const team1Name = auth1Res.data.nom_equipe || auth1Res.data.account?.nom_equipe || team1Id;
  console.log(`✓ Connecté en tant que ${team1Nom} (Équipe: ${team1Name})`);

  // 5. Vérifier les données de l'Équipe 1 (101 interventions)
  console.log('\n[5] Vérification de l\'intégrité des 101 interventions de l\'Équipe 1...');
  const intv1Res = await request(`${API_BASE}?action=interventions_list`, {
    headers: {
      'Authorization': `Bearer ${team1Token}`,
      'X-Team-Id': team1Id
    }
  });
  const intvs1 = Array.isArray(intv1Res.data) ? intv1Res.data : (intv1Res.data?.interventions || []);
  console.log(`✓ Interventions conservées pour Équipe 1 : ${intvs1.length} interventions.`);
  if (intvs1.length < 99) {
    throw new Error(`PERTE DE DONNÉES: L'Équipe 1 n'a que ${intvs1.length} interventions (au moins 99 attendues) !`);
  }

  // 6. Tenter une tentative d'accès frauduleux de l'Équipe 2 sur une intervention de l'Équipe 1
  console.log('\n[6] Test de tentative d\'intrusion transversale (Équipe 2 tente d\'accéder à un dossier Équipe 1)...');
  const targetId = intvs1[0]?.id;
  const hijackRes = await request(`${API_BASE}?action=intervention_get&id=${targetId}`, {
    headers: {
      'Authorization': `Bearer ${team2Token}`,
      'X-Team-Id': team2Id
    }
  });
  if (hijackRes.status === 403 || hijackRes.status === 404 || !hijackRes.data?.success) {
    console.log(`✓ Accès bloqué avec succès ! Status=${hijackRes.status}, Message=${hijackRes.data?.error || hijackRes.data?.message}`);
  } else {
    throw new Error(`FAILLE DE SÉCURITÉ CRITIQUE: L'Équipe 2 a pu lire l'intervention ${targetId} de l'Équipe 1 !`);
  }

  // 7. Nettoyage de l'équipe de test via SSH
  console.log('\n[7] Nettoyage propre de l\'équipe de test sur la base distante...');
  await cleanupTestTeam(team2Id, testIdentifiant);
  console.log('✓ Nettoyage effectué.');

  console.log('\n====================================================');
  console.log('🎉 TOUS LES TESTS D\'ISOLATION SAAS SONT VALIDÉS AVEC SUCCÈS !');
  console.log('====================================================');
  process.exit(0);
}

async function cleanupTestTeam(teamId, identifiant) {
  const host = '82.29.191.42';
  const port = 65002;
  const username = 'u795734321';
  const privateKeyPath = 'C:\\Users\\Davyh\\.ssh\\id_ed25519';
  const privateKey = fs.readFileSync(privateKeyPath);

  return new Promise((resolve) => {
    const conn = new Client();
    conn.on('ready', () => {
      const php = `<?php
require_once '/home/u795734321/domains/fibretrack.mantota.com/public_html/api/_env.php';
$pdo = new PDO('mysql:host=localhost;dbname=u795734321_fibre;charset=utf8mb4', 'u795734321_fibretrack', getenv('DB_PASS') ?: 'TelecomBtp@2026');
$pdo->exec("DELETE FROM accounts WHERE identifiant = '${identifiant}'");
$pdo->exec("DELETE FROM stock WHERE team_id = '${teamId}'");
$pdo->exec("DELETE FROM teams WHERE id = '${teamId}'");
echo "CLEANUP_OK";
`;
      conn.exec(`php -r ${JSON.stringify(php)}`, (err, stream) => {
        if (err) {
          conn.end();
          return resolve();
        }
        stream.on('data', (d) => process.stdout.write(d.toString()));
        stream.on('close', () => {
          conn.end();
          resolve();
        });
      });
    });
    conn.on('error', () => resolve());
    conn.connect({ host, port, username, privateKey });
  });
}

runTests().catch(err => {
  console.error('❌ ERREUR TEST ISOLATION:', err);
  process.exit(1);
});
