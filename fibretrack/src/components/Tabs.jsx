/**
 * Onglets tactiles, grands boutons, contraste élevé - usage terrain extérieur.
 * @param {{ tabs: {id: string, label: string}[], activeTab: string, onChange: (id: string) => void }} props
 */
export default function Tabs({ tabs, activeTab, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
