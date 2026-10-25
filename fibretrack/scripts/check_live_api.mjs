const res = await fetch('https://fibretrack.mantota.com/api/index.php?action=interventions_list&user_code=9999', {
  headers: { 'X-User-Code': '9999' }
});
const list = await res.json();
console.log('Total interventions:', list.length);
console.log('Dernières interventions :');
list.slice(0, 5).forEach((intv, idx) => {
  console.log(`[${idx + 1}] ID: ${intv.id} | Client: ${intv.nom_client || intv.nom_dossier} | Statut: ${intv.statut} | MAJ: ${intv.updated_at} | Vidéo: ${intv.video_url ? 'OUI' : 'NON'} | Photos: ${intv.photos_count || (Array.isArray(intv.whatsapp_photos) ? intv.whatsapp_photos.length : 'N/A')}`);
});
