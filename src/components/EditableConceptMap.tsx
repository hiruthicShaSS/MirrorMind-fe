import { useState } from "react";
import { updateConceptMap } from "../lib/api";
import { Loader, Plus, X } from "lucide-react";

interface Props {
  sessionId: string;
  conceptMap: Record<string, string[]>;
  onUpdate?: (updated: Record<string, string[]>) => void;
}

export default function EditableConceptMap({
  sessionId,
  conceptMap,
  onUpdate,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [localMap, setLocalMap] = useState(conceptMap);
  const [saving, setSaving] = useState(false);
  const [newConceptName, setNewConceptName] = useState("");

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateConceptMap(sessionId, localMap);
      onUpdate?.(localMap);
      setEditing(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save";
      alert(message);
    } finally {
      setSaving(false);
    }
  };

  const addConcept = () => {
    if (!newConceptName.trim()) return;
    setLocalMap({ ...localMap, [newConceptName.trim()]: [] });
    setNewConceptName("");
  };

  const removeConcept = (concept: string) => {
    const updated = { ...localMap };
    delete updated[concept];
    setLocalMap(updated);
  };

  const addTerm = (concept: string, term: string) => {
    if (!term.trim()) return;
    setLocalMap({
      ...localMap,
      [concept]: [...(localMap[concept] || []), term.trim()],
    });
  };

  const removeTerm = (concept: string, termIndex: number) => {
    setLocalMap({
      ...localMap,
      [concept]: localMap[concept].filter((_, i) => i !== termIndex),
    });
  };

  const updateTerm = (concept: string, termIndex: number, newValue: string) => {
    const updated = [...(localMap[concept] || [])];
    updated[termIndex] = newValue;
    setLocalMap({ ...localMap, [concept]: updated });
  };

  return (
    <div className="border border-white/20 bg-black/40 backdrop-blur-md p-6 rounded-none">
      <div className="flex justify-between items-center mb-4">
        <div className="text-sm font-bold uppercase tracking-wider text-white font-mono">
          Concept Map
        </div>
        {editing ? (
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-white text-black font-bold text-xs uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed font-mono"
            >
              {saving ? (
                <>
                  <Loader className="w-3 h-3 inline animate-spin mr-1" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setLocalMap(conceptMap);
              }}
              className="px-4 py-2 border border-white/20 text-white text-xs uppercase tracking-wider hover:bg-white/10 transition-colors font-mono"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="px-4 py-2 border border-white/20 text-white text-xs uppercase tracking-wider hover:bg-white/10 transition-colors font-mono"
          >
            Edit
          </button>
        )}
      </div>

      {Object.keys(localMap).length === 0 ? (
        <p className="text-gray-500 text-sm font-mono">No concepts yet</p>
      ) : (
        <div className="space-y-4">
          {Object.entries(localMap).map(([concept, terms]) => (
            <div
              key={concept}
              className="border-l-2 border-white/20 pl-4 py-2"
            >
              <div className="flex items-center gap-2 mb-2">
                {editing ? (
                  <input
                    type="text"
                    value={concept}
                    onChange={(e) => {
                      const updated = { ...localMap };
                      delete updated[concept];
                      updated[e.target.value] = terms;
                      setLocalMap(updated);
                    }}
                    className="flex-1 bg-white/5 border border-white/20 text-white px-2 py-1 text-sm font-mono focus:outline-none focus:border-white/40"
                  />
                ) : (
                  <div className="text-sm font-bold text-white uppercase font-mono">
                    {concept}
                  </div>
                )}
                {editing && (
                  <button
                    onClick={() => removeConcept(concept)}
                    className="p-1 hover:bg-red-900/30 text-red-400 transition-colors"
                    title="Remove concept"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="space-y-2 ml-4">
                {terms.map((term, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {editing ? (
                      <>
                        <input
                          type="text"
                          value={term}
                          onChange={(e) =>
                            updateTerm(concept, i, e.target.value)
                          }
                          className="flex-1 bg-white/5 border border-white/20 text-white px-2 py-1 text-xs font-mono focus:outline-none focus:border-white/40"
                        />
                        <button
                          onClick={() => removeTerm(concept, i)}
                          className="p-1 hover:bg-red-900/30 text-red-400 transition-colors"
                          title="Remove term"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <span className="px-2 py-1 text-xs bg-white/10 border border-white/20 text-white font-mono">
                        {term}
                      </span>
                    )}
                  </div>
                ))}
                {editing && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add term..."
                      onKeyPress={(e) => {
                        if (e.key === "Enter") {
                          addTerm(concept, (e.target as HTMLInputElement).value);
                          (e.target as HTMLInputElement).value = "";
                        }
                      }}
                      className="flex-1 bg-white/5 border border-white/20 text-white placeholder-gray-500 px-2 py-1 text-xs font-mono focus:outline-none focus:border-white/40"
                    />
                    <button
                      onClick={() => {
                        const input = document.querySelector(
                          `input[placeholder="Add term..."]`
                        ) as HTMLInputElement;
                        if (input) {
                          addTerm(concept, input.value);
                          input.value = "";
                        }
                      }}
                      className="p-1 hover:bg-white/10 text-white transition-colors"
                      title="Add term"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="mt-4 pt-4 border-t border-white/20">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="New concept name..."
              value={newConceptName}
              onChange={(e) => setNewConceptName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  addConcept();
                }
              }}
              className="flex-1 bg-white/5 border border-white/20 text-white placeholder-gray-500 px-3 py-2 text-sm font-mono focus:outline-none focus:border-white/40"
            />
            <button
              onClick={addConcept}
              className="px-4 py-2 bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors font-mono text-xs uppercase"
            >
              <Plus className="w-4 h-4 inline mr-1" />
              Add Concept
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
