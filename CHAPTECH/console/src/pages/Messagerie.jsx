import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Bouton, useCharge } from '../components/ui.jsx';

export default function Messagerie() {
  const { compte } = useAuth();
  const [conversationActiveId, setConversationActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [texte, setTexte] = useState('');
  const [photoFichier, setPhotoFichier] = useState(null);
  const [photoApercu, setPhotoApercu] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [modalNouveau, setModalNouveau] = useState(false);
  const [destinataireId, setDestinataireId] = useState('');

  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Charger les conversations
  const conversations = useCharge(() => api.get('/messagerie/conversations'));
  // Charger les comptes de l'entreprise pour ouvrir des chats directs
  const comptes = useCharge(() => api.get('/comptes'));

  const listeConversations = conversations.data ?? [];
  const convActive = listeConversations.find((c) => c.id === conversationActiveId) || listeConversations[0];

  // Sélectionner la première conversation par défaut
  useEffect(() => {
    if (!conversationActiveId && listeConversations.length > 0) {
      setConversationActiveId(listeConversations[0].id);
    }
  }, [listeConversations, conversationActiveId]);

  // Charger les messages du canal actif + polling régulier (toutes les 4 secondes)
  useEffect(() => {
    if (!convActive?.id) return;

    let monte = true;
    async function chargerMessages() {
      try {
        const res = await api.get(`/messagerie/conversations/${convActive.id}/messages`);
        if (monte) {
          setMessages(res.messages ?? []);
        }
      } catch (err) {
        console.error('Erreur chargement messages', err);
      }
    }

    chargerMessages();
    const timer = setInterval(chargerMessages, 4000);

    return () => {
      monte = false;
      clearInterval(timer);
    };
  }, [convActive?.id]);

  // Défilement automatique vers le bas
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function gererPhoto(e) {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFichier(file);
      setPhotoApercu(URL.createObjectURL(file));
    }
  }

  function annulerPhoto() {
    setPhotoFichier(null);
    setPhotoApercu(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function envoyer(e) {
    e?.preventDefault();
    if (!texte.trim() && !photoFichier) return;
    if (!convActive?.id) return;

    setEnvoi(true);
    try {
      if (photoFichier) {
        const formData = new FormData();
        if (texte.trim()) formData.append('contenu', texte.trim());
        formData.append('photo', photoFichier);

        // Appel direct fetch avec FormData pour préserver le fichier
        const reponse = await fetch(`/api/v1/messagerie/conversations/${convActive.id}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('chaptech.token')}`,
          },
          body: formData,
        });
        if (!reponse.ok) throw new Error('Échec upload photo');
        const nouveau = await reponse.json();
        setMessages((prev) => [...prev, nouveau]);
      } else {
        const nouveau = await api.post(`/messagerie/conversations/${convActive.id}/messages`, {
          contenu: texte.trim(),
        });
        setMessages((prev) => [...prev, nouveau]);
      }

      setTexte('');
      annulerPhoto();
      conversations.recharger();
    } catch (err) {
      alert(err.message ?? 'Erreur envoi message');
    } finally {
      setEnvoi(false);
    }
  }

  async function supprimer(msgId) {
    if (!confirm('Supprimer ce message pour tout le monde ?')) return;
    try {
      await api.delete(`/messagerie/messages/${msgId}`);
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    } catch (err) {
      alert(err.corps?.error ?? 'Impossible de supprimer.');
    }
  }

  async function lancerDiscussionDirecte(e) {
    e.preventDefault();
    if (!destinataireId) return;
    try {
      const res = await api.post('/messagerie/conversations/directe', {
        destinataire_id: Number(destinataireId),
      });
      setModalNouveau(false);
      setDestinataireId('');
      await conversations.recharger();
      setConversationActiveId(res.id);
    } catch (err) {
      alert(err.corps?.error ?? 'Erreur lors de la création de la discussion.');
    }
  }

  // Filtrer les contacts éligibles (tous sauf moi)
  const contacts = (comptes.data?.data ?? []).filter((c) => c.id !== compte.id);

  // Groupement des conversations
  const canauxEntreprise = listeConversations.filter((c) => c.type === 'entreprise');
  const canauxVilles = listeConversations.filter((c) => c.type === 'ville');
  const canauxEquipes = listeConversations.filter((c) => c.type === 'equipe');
  const discussionsDirectes = listeConversations.filter((c) => c.type === 'direct');

  return (
    <div className="flex h-[calc(100vh-6rem)] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
      {/* 1. Colonne de gauche : Canaux et discussions */}
      <aside className="w-80 flex-shrink-0 flex flex-col border-r border-slate-800 bg-slate-900/40">
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <div>
            <h2 className="font-semibold text-slate-100 flex items-center gap-2">
              <span>💬 ChatTech</span>
            </h2>
            <p className="text-xs text-slate-400">Messagerie interne sécurisée</p>
          </div>
          <button
            onClick={() => setModalNouveau(true)}
            title="Nouvelle discussion privée"
            className="rounded-lg bg-sky-600/20 px-2.5 py-1 text-xs font-medium text-sky-300 hover:bg-sky-600/30"
          >
            + Privé
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* Canaux généraux */}
          <div className="space-y-1">
            <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Canaux Généraux
            </p>
            {canauxEntreprise.map((c) => (
              <BoutonCanal
                key={c.id}
                conv={c}
                actif={c.id === convActive?.id}
                onClick={() => setConversationActiveId(c.id)}
              />
            ))}
          </div>

          {/* Canaux de Ville */}
          {canauxVilles.length > 0 && (
            <div className="space-y-1">
              <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Canaux par Ville
              </p>
              {canauxVilles.map((c) => (
                <BoutonCanal
                  key={c.id}
                  conv={c}
                  actif={c.id === convActive?.id}
                  onClick={() => setConversationActiveId(c.id)}
                />
              ))}
            </div>
          )}

          {/* Canaux d'Équipe */}
          {canauxEquipes.length > 0 && (
            <div className="space-y-1">
              <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Canaux d'Équipes
              </p>
              {canauxEquipes.map((c) => (
                <BoutonCanal
                  key={c.id}
                  conv={c}
                  actif={c.id === convActive?.id}
                  onClick={() => setConversationActiveId(c.id)}
                />
              ))}
            </div>
          )}

          {/* Discussions privées 1 à 1 */}
          <div className="space-y-1">
            <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Messages Privés (1 à 1)
            </p>
            {discussionsDirectes.length === 0 && (
              <p className="px-2 text-xs italic text-slate-600">Aucune discussion privée.</p>
            )}
            {discussionsDirectes.map((c) => (
              <BoutonCanal
                key={c.id}
                conv={c}
                actif={c.id === convActive?.id}
                onClick={() => setConversationActiveId(c.id)}
              />
            ))}
          </div>
        </div>
      </aside>

      {/* 2. Fenêtre de discussion principale */}
      <section className="flex flex-1 flex-col overflow-hidden bg-slate-950">
        {convActive ? (
          <>
            {/* En-tête de la discussion active */}
            <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/40 px-6 py-3">
              <div>
                <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                  <span>{convActive.titre}</span>
                  <Badge valeur={convActive.type} />
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {convActive.membres?.length ?? 0} membres connectés dans ce canal
                </p>
              </div>
            </header>

            {/* Zone des messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 && (
                <div className="flex h-full items-center justify-center text-center text-slate-500 text-sm">
                  <p>Aucun message pour l'instant. Dites bonjour à l'équipe ! 👋</p>
                </div>
              )}

              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.est_moi ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-baseline gap-2 mb-1 px-1">
                    <span className="text-xs font-semibold text-slate-300">
                      {m.est_moi ? 'Moi' : m.auteur?.nom}
                    </span>
                    {!m.est_moi && m.auteur?.role && (
                      <span className="text-[10px] text-slate-500 font-mono">
                        ({m.auteur.role})
                      </span>
                    )}
                    <span className="text-[10px] text-slate-500">
                      {m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>

                  <div
                    className={`group relative max-w-lg rounded-2xl p-3 text-sm shadow-sm ${
                      m.est_moi
                        ? 'bg-sky-600 text-white rounded-tr-none'
                        : 'bg-slate-800/80 text-slate-100 rounded-tl-none border border-slate-700/60'
                    }`}
                  >
                    {/* Photo jointe */}
                    {m.photo_url && (
                      <div className="mb-2 overflow-hidden rounded-xl bg-black/40">
                        <img
                          src={m.photo_url}
                          alt={m.photo_nom || 'Photo'}
                          className="max-h-60 w-auto rounded-lg object-contain cursor-pointer transition-transform hover:scale-105"
                          onClick={() => window.open(m.photo_url, '_blank')}
                        />
                      </div>
                    )}

                    {/* Texte du message */}
                    {m.contenu && <p className="whitespace-pre-wrap">{m.contenu}</p>}

                    {/* Action de suppression */}
                    {(m.est_moi || compte.role === 'admin' || compte.role === 'super_admin') && (
                      <button
                        onClick={() => supprimer(m.id)}
                        title="Supprimer ce message"
                        className="absolute -top-2 -right-2 hidden rounded-full bg-slate-900 border border-slate-700 p-1 text-slate-400 hover:text-rose-400 group-hover:block"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Aperçu de la photo sélectionnée avant envoi */}
            {photoApercu && (
              <div className="flex items-center gap-3 border-t border-slate-800 bg-slate-900/60 p-2.5 px-6">
                <div className="relative">
                  <img
                    src={photoApercu}
                    alt="Aperçu"
                    className="h-16 w-16 rounded-lg object-cover border border-slate-700"
                  />
                  <button
                    onClick={annulerPhoto}
                    className="absolute -top-1.5 -right-1.5 rounded-full bg-rose-600 text-white p-0.5"
                  >
                    ✕
                  </button>
                </div>
                <span className="text-xs text-slate-300 truncate">{photoFichier?.name}</span>
              </div>
            )}

            {/* Formulaire de saisie du message */}
            <form onSubmit={envoyer} className="border-t border-slate-800 bg-slate-900/50 p-4">
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={gererPhoto}
                  className="hidden"
                  id="chat-photo-input"
                />
                <label
                  htmlFor="chat-photo-input"
                  className="cursor-pointer rounded-xl border border-slate-700 bg-slate-800/80 p-2.5 text-slate-400 hover:text-slate-200 transition-colors"
                  title="Ajouter une photo"
                >
                  📷
                </label>

                <input
                  type="text"
                  placeholder="Écrivez votre message… (Entrée pour envoyer)"
                  value={texte}
                  onChange={(e) => setTexte(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500"
                />

                <Bouton type="submit" disabled={envoi || (!texte.trim() && !photoFichier)}>
                  {envoi ? '…' : 'Envoyer'}
                </Bouton>
              </div>
            </form>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-slate-500">
            Sélectionnez un canal pour discuter.
          </div>
        )}
      </section>

      {/* Modal Nouvelle discussion privée */}
      {modalNouveau && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={lancerDiscussionDirecte}
            className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4"
          >
            <h3 className="text-base font-semibold text-slate-100">
              Ouvrir une discussion privée
            </h3>
            <p className="text-xs text-slate-400">
              Choisissez un membre de votre entreprise pour échanger en privé 1 à 1.
            </p>

            <label className="block">
              <span className="text-xs text-slate-400">Destinataire :</span>
              <select
                required
                value={destinataireId}
                onChange={(e) => setDestinataireId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100 outline-none focus:border-sky-500"
              >
                <option value="">— Choisir un contact —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom} ({c.role}{c.ville ? ` - ${c.ville.nom}` : ''})
                  </option>
                ))}
              </select>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Bouton type="button" variante="neutre" onClick={() => setModalNouveau(false)}>
                Annuler
              </Bouton>
              <Bouton type="submit" disabled={!destinataireId}>
                Ouvrir
              </Bouton>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function BoutonCanal({ conv, actif, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors ${
        actif
          ? 'bg-sky-600/20 text-sky-300 font-medium'
          : 'text-slate-300 hover:bg-slate-800/60'
      }`}
    >
      <div className="truncate pr-2">
        <p className="truncate">{conv.titre}</p>
      </div>
      {conv.non_lus_count > 0 && (
        <span className="rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
          {conv.non_lus_count}
        </span>
      )}
    </button>
  );
}
